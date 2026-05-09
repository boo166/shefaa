/**
 * Distributed trace correlation helpers.
 * Extend payloads (RPC, jobs, realtime metadata) with these IDs.
 */
export type PlatformTraceIds = {
  requestTraceId: string;
  operationTraceId: string;
  tenantId?: string | null;
  actorId?: string | null;
  sessionVersion?: string | null;
  /** Correlates tenant switch, incident mode, auth recovery across kernels. */
  runtimeTransitionTraceId?: string | null;
};

export function newRequestTraceId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newOperationTraceId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newWorkflowTraceId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `wf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newJobTraceId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newRealtimeTraceId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newRuntimeTransitionTraceId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `rtx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildTracePayload(partial: Partial<PlatformTraceIds> & { requestTraceId?: string; operationTraceId?: string }): PlatformTraceIds {
  return {
    requestTraceId: partial.requestTraceId ?? newRequestTraceId(),
    operationTraceId: partial.operationTraceId ?? newOperationTraceId(),
    tenantId: partial.tenantId,
    actorId: partial.actorId,
    sessionVersion: partial.sessionVersion,
    runtimeTransitionTraceId: partial.runtimeTransitionTraceId,
  };
}
