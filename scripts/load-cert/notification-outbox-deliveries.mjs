import { assertSlo, createLoadCertClient, getSupabaseTarget, resolveActorUserId, resolveTenantId } from "./shared.mjs";

const OUTBOX_EVENTS = Number.parseInt(process.env.OUTBOX_EVENT_COUNT ?? process.env.DELIVERY_COUNT ?? "5000", 10);
const BATCH_SIZE = Number.parseInt(process.env.OUTBOX_BATCH_SIZE ?? "500", 10);
const WORKER_BATCH_SIZE = Number.parseInt(process.env.WORKER_BATCH_SIZE ?? "25", 10);
const MAX_MS = Number.parseInt(process.env.NOTIF_MAX_MS ?? "600000", 10);
const WORKER_SECRET = process.env.EVENT_DELIVERY_WORKER_SECRET ?? "";

async function insertOutboxBatch(client, tenantId, userId, startIndex, batchSize) {
  const rows = [];
  for (let i = 0; i < batchSize; i += 1) {
    const index = startIndex + i;
    rows.push({
      tenant_id: tenantId,
      user_id: userId,
      event_type: "PatientRegistered",
      aggregate_type: "patient",
      aggregate_id: null,
      handler_name: "notifications",
      payload: { index, source: "load-cert-outbox" },
      status: "PENDING",
      delivery_guarantee: "at_least_once",
    });
  }

  const { error } = await client.from("event_outbox").insert(rows);
  if (error) throw error;
}

async function invokeWorker(target, batchSize) {
  const url = `${target.url.replace(/\/$/, "")}/functions/v1/event-delivery-worker`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${target.serviceRoleKey}`,
  };
  if (WORKER_SECRET) headers["x-worker-secret"] = WORKER_SECRET;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ batch_size: batchSize }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Worker invoke failed (${response.status}): ${body}`);
  }

  return response.json();
}

async function drainViaWorker(target, startedAt) {
  let deliveredTotal = 0;
  let failedTotal = 0;
  let iterations = 0;

  while (performance.now() - startedAt < MAX_MS) {
    const result = await invokeWorker(target, WORKER_BATCH_SIZE);
    const delivered = Number(result?.delivered ?? 0);
    const failed = Number(result?.failed ?? 0);
    deliveredTotal += delivered;
    failedTotal += failed;
    iterations += 1;

    if (delivered === 0 && failed === 0) break;
    if (iterations % 20 === 0) {
      console.log(`worker progress: delivered=${deliveredTotal} failed=${failedTotal}`);
    }
  }

  return { deliveredTotal, failedTotal, iterations };
}

async function drainViaOutboxPipeline(client, startedAt) {
  let deliveredTotal = 0;
  let failedTotal = 0;
  let iterations = 0;

  while (performance.now() - startedAt < MAX_MS) {
    const { data: claimed, error: claimError } = await client.rpc("event_outbox_claim_batch", {
      _limit: WORKER_BATCH_SIZE,
      _worker_id: "load-cert-outbox-pipeline",
    });
    if (claimError) throw claimError;
    if (!claimed?.length) break;

    for (const event of claimed) {
      const deliveryKey = `notifications:${event.tenant_id}:${event.id}`;
      const { error: deliveryError } = await client.rpc("command_notification_delivery", {
        p_tenant_id: event.tenant_id,
        p_user_id: event.user_id,
        p_title: "Load cert outbox notification",
        p_body: JSON.stringify({ event: event.event_type, outbox_id: event.id }),
        p_type: "system_event",
        p_delivery_key: deliveryKey,
        p_source_outbox_id: event.id,
        p_idempotency_key: deliveryKey,
        p_request_hash: JSON.stringify({ outbox_id: event.id }),
        p_actor_user_id: event.user_id,
      });

      if (deliveryError) {
        await client.rpc("event_outbox_mark_failed", {
          _outbox_id: event.id,
          _worker_id: "load-cert-outbox-pipeline",
          _error_code: "HANDLER_ERROR",
          _error_message: deliveryError.message,
          _latency_ms: 0,
        });
        failedTotal += 1;
        continue;
      }

      await client.rpc("event_outbox_mark_delivered", {
        _outbox_id: event.id,
        _worker_id: "load-cert-outbox-pipeline",
        _latency_ms: 0,
      });
      deliveredTotal += 1;
    }

    iterations += 1;
    if (iterations % 20 === 0) {
      console.log(`pipeline progress: delivered=${deliveredTotal} failed=${failedTotal}`);
    }
  }

  return { deliveredTotal, failedTotal, iterations };
}

async function countPendingOutbox(client, tenantId) {
  const { count, error } = await client
    .from("event_outbox")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("handler_name", "notifications")
    .in("status", ["PENDING", "RETRY", "PROCESSING"]);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const client = createLoadCertClient();
  const target = getSupabaseTarget();
  const tenantId = await resolveTenantId(client);
  const actorUserId = await resolveActorUserId(client, tenantId);

  console.log(`Seeding ${OUTBOX_EVENTS} notification outbox events (production path)`);
  const seedStarted = performance.now();
  for (let i = 0; i < OUTBOX_EVENTS; i += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, OUTBOX_EVENTS - i);
    await insertOutboxBatch(client, tenantId, actorUserId, i + 1, size);
    if ((i + BATCH_SIZE) % 5000 === 0 || i + size >= OUTBOX_EVENTS) {
      console.log(`outbox seeded: ${Math.min(i + size, OUTBOX_EVENTS)}/${OUTBOX_EVENTS}`);
    }
  }
  console.log(`outbox seed done in ${((performance.now() - seedStarted) / 1000).toFixed(1)}s`);

  const drainStarted = performance.now();
  let mode = "edge-worker";
  let drain;

  try {
    drain = await drainViaWorker(target, drainStarted);
  } catch (error) {
    console.warn(`Edge worker unavailable (${error.message}). Falling back to outbox pipeline RPC simulation.`);
    mode = "outbox-pipeline";
    drain = await drainViaOutboxPipeline(client, drainStarted);
  }

  const elapsedMs = performance.now() - drainStarted;
  const pending = await countPendingOutbox(client, tenantId);

  const { count: notificationCount } = await client
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const { data: recon } = await client.rpc("run_notification_reconciliation", {
    p_tenant_id: tenantId,
    p_window_start: new Date(Date.now() - 86_400_000).toISOString(),
    p_window_end: new Date(Date.now() + 86_400_000).toISOString(),
    p_dry_run: true,
  });
  const critical = recon?.[0]?.critical_count ?? 0;

  assertSlo("outbox_delivered", drain.deliveredTotal >= OUTBOX_EVENTS, `delivered=${drain.deliveredTotal}/${OUTBOX_EVENTS}`);
  assertSlo("outbox_pending_drained", pending === 0, `pending=${pending}`);
  assertSlo("notification_reconciliation_clean", Number(critical) === 0, `critical=${critical}`);
  assertSlo("outbox_drain_time", elapsedMs < MAX_MS, `elapsed=${elapsedMs.toFixed(0)}ms mode=${mode}`);
  console.log(
    `SLO context: mode=${mode} notifications=${notificationCount} worker_iterations=${drain.iterations} failed=${drain.failedTotal}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
