import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getAllowedOriginsFromEnv } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { initSentry } from "../_shared/sentry.ts";
import { logError, logInfo, logWarn, persistSystemLog } from "../_shared/logger.ts";
import { createRequestId } from "../_shared/request.ts";

const allowedOrigins = getAllowedOriginsFromEnv();
const DEFAULT_BATCH_SIZE = 25;
const WORKER_ID = "event-delivery-worker";

type OutboxEvent = {
  id: string;
  domain_event_id: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string | null;
  tenant_id: string;
  user_id: string | null;
  handler_name: "audit" | "notifications" | "analytics" | string;
  payload: Record<string, unknown>;
  attempts: number;
  request_trace_id: string | null;
  operation_trace_id: string | null;
  workflow_trace_id: string | null;
};

const EVENT_TITLES: Record<string, string> = {
  AppointmentCreated: "New appointment created",
  AppointmentLifecycleTransitioned: "Appointment status updated",
  InvoicePaid: "Invoice marked as paid",
  InsuranceClaimTransitioned: "Insurance claim updated",
  LabResultUploaded: "Lab results updated",
  MedicationStockAdjusted: "Medication stock updated",
  PrescriptionIssued: "New prescription issued",
  PatientRegistered: "New patient registered",
};

const EVENT_ACTIONS: Record<string, { action: string; entityType: string }> = {
  AppointmentCreated: { action: "appointment_created", entityType: "appointment" },
  AppointmentLifecycleTransitioned: { action: "appointment_lifecycle_transitioned", entityType: "appointment" },
  InvoicePaid: { action: "invoice_paid", entityType: "invoice" },
  InsuranceClaimTransitioned: { action: "insurance_claim_transitioned", entityType: "insurance_claim" },
  LabResultUploaded: { action: "lab_result_uploaded", entityType: "lab_order" },
  MedicationStockAdjusted: { action: "medication_stock_adjusted", entityType: "medication" },
  PrescriptionIssued: { action: "prescription_issued", entityType: "prescription" },
  PatientRegistered: { action: "patient_registered", entityType: "patient" },
};

function asUuid(value: string | null | undefined) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function classifyDeliveryFailure(err: unknown): { errorCode: string; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  const normalized = message.toLowerCase();
  if (
    normalized.includes("timeout")
    || normalized.includes("temporar")
    || normalized.includes("network")
    || normalized.includes("rate limit")
  ) {
    return { errorCode: "TRANSIENT_ERROR", message };
  }
  return { errorCode: "HANDLER_ERROR", message };
}

async function deliverAudit(adminClient: ReturnType<typeof createClient>, event: OutboxEvent) {
  const mapping = EVENT_ACTIONS[event.event_type] ?? {
    action: event.event_type.toLowerCase(),
    entityType: event.aggregate_type,
  };

  if (!event.user_id) {
    throw new Error("Audit event is missing user_id");
  }

  const details = {
    ...event.payload,
    event_outbox_id: event.id,
    domain_event_type: event.event_type,
    operation_trace_id: event.operation_trace_id,
    workflow_trace_id: event.workflow_trace_id,
  };

  const { error } = await adminClient.rpc("log_audit_event", {
    _tenant_id: event.tenant_id,
    _user_id: event.user_id,
    _action: mapping.action,
    _entity_type: mapping.entityType,
    _entity_id: event.aggregate_id,
    _details: details,
    _request_id: asUuid(event.request_trace_id),
    _action_type: mapping.action,
    _resource_type: mapping.entityType,
  });

  if (error && error.code !== "23505") {
    throw new Error(error.message ?? "Failed to persist audit delivery");
  }
}

async function deliverNotification(adminClient: ReturnType<typeof createClient>, event: OutboxEvent) {
  if (!event.user_id) {
    throw new Error("Notification event is missing user_id");
  }

  const title = EVENT_TITLES[event.event_type] ?? event.event_type;
  const deliveryKey = `notifications:${event.tenant_id}:${event.id}`;
  const { error } = await adminClient.rpc("command_notification_delivery", {
    p_tenant_id: event.tenant_id,
    p_user_id: event.user_id,
    p_title: title,
    p_body: JSON.stringify({
      event: event.event_type,
      payload: event.payload,
      event_outbox_id: event.id,
      source_event_id: event.domain_event_id,
      operation_trace_id: event.operation_trace_id,
      workflow_trace_id: event.workflow_trace_id,
    }),
    p_type: "system_event",
    p_delivery_key: deliveryKey,
    p_source_event_id: event.domain_event_id,
    p_source_outbox_id: event.id,
    p_read: false,
    p_idempotency_key: deliveryKey,
    p_request_hash: JSON.stringify({
      event_type: event.event_type,
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      user_id: event.user_id,
    }),
    p_actor_user_id: event.user_id,
    p_request_trace_id: event.request_trace_id,
    p_operation_trace_id: event.operation_trace_id,
    p_workflow_trace_id: event.workflow_trace_id,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to persist notification delivery");
  }
}

async function deliverAnalytics(adminClient: ReturnType<typeof createClient>, event: OutboxEvent) {
  const { error } = await adminClient.from("jobs").insert({
    tenant_id: event.tenant_id,
    type: "refresh-materialized-views",
    payload: {
      tenant_id: event.tenant_id,
      event: event.event_type,
      _platform_trace: {
        requestTraceId: event.request_trace_id,
        operationTraceId: event.operation_trace_id,
        workflowTraceId: event.workflow_trace_id,
        tenantId: event.tenant_id,
        actorId: event.user_id,
        sourceOutboxId: event.id,
      },
    },
    initiated_by: event.user_id,
    initiated_as: "system",
    max_attempts: 1,
  });

  if (error) {
    throw new Error(error.message ?? "Failed to enqueue analytics delivery");
  }
}

async function deliverEvent(adminClient: ReturnType<typeof createClient>, event: OutboxEvent) {
  switch (event.handler_name) {
    case "audit":
      await deliverAudit(adminClient, event);
      return;
    case "notifications":
      await deliverNotification(adminClient, event);
      return;
    case "analytics":
      await deliverAnalytics(adminClient, event);
      return;
    default:
      throw new Error(`Unknown event handler: ${event.handler_name}`);
  }
}

Deno.serve(async (req) => {
  initSentry();
  const { corsHeaders, errorResponse } = enforceCors(req, { allowedOrigins });
  const requestId = createRequestId(req);
  const baseHeaders = { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId };

  if (errorResponse) return errorResponse;
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: baseHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const workerSecret = Deno.env.get("EVENT_DELIVERY_WORKER_SECRET");
  const incomingSecret = req.headers.get("x-worker-secret");

  let adminClient: ReturnType<typeof createClient>;
  let actorUserId: string | null = null;

  if (workerSecret && incomingSecret === workerSecret) {
    adminClient = createClient(supabaseUrl, serviceRoleKey);
  } else {
    const auth = await requireAdmin(req);
    if ("error" in auth) {
      return new Response(auth.error.body, { status: auth.error.status, headers: baseHeaders });
    }
    adminClient = auth.adminClient;
    actorUserId = auth.userId;
  }

  const body = req.body ? await req.json().catch(() => ({})) : {};
  const batchSize = typeof body?.batch_size === "number" ? body.batch_size : DEFAULT_BATCH_SIZE;

  try {
    const { data, error } = await adminClient.rpc("event_outbox_claim_batch", {
      _limit: batchSize,
      _worker_id: WORKER_ID,
    });
    if (error) throw error;

    let delivered = 0;
    let failed = 0;
    let deadLettered = 0;

    for (const event of (data ?? []) as OutboxEvent[]) {
      const started = Date.now();
      try {
        await deliverEvent(adminClient, event);
        const latencyMs = Date.now() - started;
        const { error: markError } = await adminClient.rpc("event_outbox_mark_delivered", {
          _outbox_id: event.id,
          _worker_id: WORKER_ID,
          _latency_ms: latencyMs,
        });
        if (markError) throw markError;
        delivered += 1;
      } catch (err) {
        const latencyMs = Date.now() - started;
        const failure = classifyDeliveryFailure(err);
        const { data: nextStatus, error: failError } = await adminClient.rpc("event_outbox_mark_failed", {
          _outbox_id: event.id,
          _worker_id: WORKER_ID,
          _error_code: failure.errorCode,
          _error_message: failure.message,
          _latency_ms: latencyMs,
        });
        if (failError) throw failError;
        failed += 1;
        if (nextStatus === "DEAD_LETTER") deadLettered += 1;

        await persistSystemLog(adminClient, WORKER_ID, "error", "event_delivery_failed", {
          request_id: requestId,
          tenant_id: event.tenant_id,
          user_id: event.user_id ?? actorUserId ?? undefined,
          action_type: "event_delivery",
          resource_type: event.event_type,
          metadata: {
            outbox_id: event.id,
            handler_name: event.handler_name,
            attempts: event.attempts,
            next_status: nextStatus,
            error_code: failure.errorCode,
            error: failure.message,
          },
        });
      }
    }

    logInfo("event_delivery_worker_completed", {
      request_id: requestId,
      action_type: "event_delivery",
      resource_type: "event_outbox",
      metadata: { claimed: data?.length ?? 0, delivered, failed, dead_lettered: deadLettered },
    });

    return new Response(JSON.stringify({ success: true, claimed: data?.length ?? 0, delivered, failed, dead_lettered: deadLettered }), {
      status: 200,
      headers: baseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logWarn("event_delivery_worker_failed", {
      request_id: requestId,
      action_type: "event_delivery",
      resource_type: "event_outbox",
      metadata: { error: message },
    });
    logError("event_delivery_worker_failed", {
      request_id: requestId,
      action_type: "event_delivery",
      resource_type: "event_outbox",
      metadata: { error: message },
    });
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: baseHeaders });
  }
});
