import { newRequestTraceId } from "@/platform/observability/traceContext";
import { runtimeEventBus } from "./runtimeEventBus";

function newEventId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : newRequestTraceId();
}

export function notifyTenantContextChanged(input: { tenantId: string | null; actorId?: string | null }) {
  runtimeEventBus.publish({
    type: "TENANT_CONTEXT_CHANGED",
    traceId: newRequestTraceId(),
    eventId: newEventId(),
    tenantId: input.tenantId,
    actorId: input.actorId,
    payload: { source: "auth_store" },
  });
}

export function notifyAuthBoundaryChanged(input?: { reason?: string }) {
  runtimeEventBus.publish({
    type: "AUTH_BOUNDARY_CHANGED",
    traceId: newRequestTraceId(),
    eventId: newEventId(),
    payload: { reason: input?.reason ?? "boundary" },
  });
}
