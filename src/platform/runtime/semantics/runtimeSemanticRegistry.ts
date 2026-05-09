import type { RecoveryStrategy, RuntimeFailureKind, SemanticAction } from "./runtimeSemanticTypes";

/** Runtime law: failure kind → ordered semantic actions. */
export const RUNTIME_SEMANTIC_REGISTRY: Record<RuntimeFailureKind, readonly SemanticAction[]> = {
  stale_epoch: ["ABORT", "INVALIDATE_QUERY_SCOPES", "RECONCILE"],
  /** Teardown leads recovery strategy; later steps converge tenant/query state. */
  tenant_mismatch: ["TEARDOWN", "ABORT", "INVALIDATE_QUERY_SCOPES", "RECONCILE"],
  realtime_drift: ["RECONCILE"],
  policy_denied: ["DENY"],
  runtime_mode_block: ["DENY", "CONTAIN"],
  barrier_timeout: ["CONTAIN", "FAIL_SAFE"],
  coordination_partition: ["CONTAIN", "ESCALATE"],
  recovery_required: ["RECONCILE", "RETRY"],
  workflow_divergence: ["COMPENSATE", "ABORT"],
  readonly_transition: ["PAUSE_CHECKPOINTS", "CONTAIN", "INVALIDATE_QUERY_SCOPES"],
  auth_invalidation: ["CONTAIN", "TEARDOWN"],
  barrier_stall: ["FAIL_SAFE", "CONTAIN"],
  transition_incomplete: ["RECONCILE", "RETRY"],
  workflow_mismatch: ["COMPENSATE", "ABORT"],
};

const ACTION_TO_RECOVERY: Partial<Record<SemanticAction, RecoveryStrategy>> = {
  TEARDOWN: "teardown",
  COMPENSATE: "compensate",
  RECONCILE: "reconcile",
  CONTAIN: "containment",
  FAIL_SAFE: "safe_mode",
  ABORT: "abort",
  DENY: "abort",
  RETRY: "abort",
  INVALIDATE_QUERY_SCOPES: "reconcile",
  ESCALATE: "containment",
  PAUSE_CHECKPOINTS: "checkpoint_pause",
};

/** Derive legacy RecoveryStrategy from the ordered action list (first match wins). */
export function deriveRecoveryStrategy(actions: readonly SemanticAction[]): RecoveryStrategy {
  for (const a of actions) {
    const s = ACTION_TO_RECOVERY[a];
    if (s) return s;
  }
  return "reconcile";
}

const SEVERITY: Record<RuntimeFailureKind, "info" | "warning" | "critical"> = {
  stale_epoch: "warning",
  tenant_mismatch: "critical",
  policy_denied: "info",
  runtime_mode_block: "warning",
  realtime_drift: "warning",
  workflow_divergence: "critical",
  barrier_timeout: "critical",
  coordination_partition: "critical",
  recovery_required: "warning",
  readonly_transition: "warning",
  auth_invalidation: "critical",
  barrier_stall: "critical",
  transition_incomplete: "warning",
  workflow_mismatch: "critical",
};

export function semanticSeverity(kind: RuntimeFailureKind): "info" | "warning" | "critical" {
  return SEVERITY[kind];
}
