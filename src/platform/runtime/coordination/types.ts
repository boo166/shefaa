/**
 * Cross-kernel coordination: single operational truth across tabs, policy, workflows, and realtime.
 */

export type RuntimeTransitionKind =
  | "tenant_switch"
  | "logout"
  | "readonly_enter"
  | "auth_recovery"
  | "generic";

export type RuntimeEpochStrategy = "bump_on_complete" | "bump_on_start" | "none";

export type RuntimeCoordinationEventType =
  | "AUTH_BOUNDARY_CHANGED"
  | "TENANT_CONTEXT_CHANGED"
  | "RUNTIME_MODE_CHANGED"
  | "POLICY_ENFORCEMENT_CHANGED"
  | "WORKFLOW_ABORTED"
  | "REALTIME_DEGRADED"
  | "INCIDENT_MODE_ENTERED"
  | "RUNTIME_EPOCH_BUMPED";

export type RuntimeCoordinationEvent = {
  type: RuntimeCoordinationEventType;
  epoch: number;
  /** Unique id for deduplication across tabs / retries. */
  eventId: string;
  /** Event envelope version (protocol). */
  envelopeVersion: number;
  /** Wall time when the event was issued (replay guard). */
  issuedAt: number;
  traceId: string;
  /** Correlates one distributed transition across UI, RPC, workflows, realtime, metrics. */
  runtimeTransitionTraceId?: string;
  tenantId?: string | null;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /** @deprecated Prefer issuedAt; kept for backward compatibility with readers. */
  occurredAt: number;
};

export type RuntimeEpochBumpReason =
  | "auth_boundary"
  | "tenant_switch"
  | "runtime_mode"
  | "capability_refresh"
  | "incident"
  | "workflow_invalidation"
  | "reconnect_recovery"
  | "policy_enforcement"
  | "manual";
