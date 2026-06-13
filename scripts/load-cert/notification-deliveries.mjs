import { assertSlo, createLoadCertClient, resolveActorUserId, resolveTenantId } from "./shared.mjs";

// Direct RPC authority stress test (not the production delivery path).
// Production path: npm run load-cert:notifications-outbox

const DELIVERIES = Number.parseInt(process.env.DELIVERY_COUNT ?? "5000", 10);

async function main() {
  const client = createLoadCertClient();
  const tenantId = await resolveTenantId(client);
  const actorUserId = await resolveActorUserId(client, tenantId);

  const { data: profile } = await client.from("profiles").select("user_id").eq("tenant_id", tenantId).eq("user_id", actorUserId).maybeSingle();
  if (!profile?.user_id) throw new Error("Missing profile user for notification load cert.");

  const started = performance.now();
  for (let i = 1; i <= DELIVERIES; i += 1) {
    const { data, error } = await client.rpc("command_notification_delivery", {
      p_tenant_id: tenantId,
      p_user_id: profile.user_id,
      p_title: `Load cert notification ${i}`,
      p_body: JSON.stringify({ index: i }),
      p_type: "system_event",
      p_delivery_key: `load-cert-del-${tenantId}-${i}`,
      p_request_hash: `hash-${i}`,
      p_actor_user_id: actorUserId,
    });
    if (error || data?.[0]?.result_code !== "OK") throw error ?? new Error(`Delivery ${i} failed`);
  }
  const elapsedMs = performance.now() - started;

  const { count } = await client.from("notifications").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
  assertSlo("delivery_volume", (count ?? 0) >= DELIVERIES, `notifications=${count}`);

  const { data: recon } = await client.rpc("run_notification_reconciliation", {
    p_tenant_id: tenantId,
    p_window_start: new Date(Date.now() - 86_400_000).toISOString(),
    p_window_end: new Date(Date.now() + 86_400_000).toISOString(),
    p_dry_run: true,
  });
  const critical = recon?.[0]?.critical_count ?? 0;
  assertSlo("notification_reconciliation_clean", Number(critical) === 0, `critical=${critical}`);
  assertSlo("delivery_drain_time", elapsedMs < Number(process.env.NOTIF_MAX_MS ?? "120000"), `elapsed=${elapsedMs.toFixed(0)}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
