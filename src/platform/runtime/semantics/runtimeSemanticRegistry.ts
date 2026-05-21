import type {
  CanonicalFailureKind,
  OperatorVisibility,
  RecoveryClass,
  RecoveryContract,
  RecoveryStrategy,
  ReplaySafety,
  RuntimeEffect,
  RuntimeFailureKind,
  SemanticAction,
} from "./runtimeSemanticTypes";

/** Runtime law: failure kind → ordered semantic actions. */
export const RUNTIME_SEMANTIC_REGISTRY: Record<RuntimeFailureKind, readonly SemanticAction[]> = {
  stale_epoch: ["ABORT", "INVALIDATE_QUERY_SCOPES", "RECONCILE"],
  /** Teardown leads recovery strategy; later steps converge tenant/query state. */
  tenant_mismatch: ["TEARDOWN", "ABORT", "INVALIDATE_QUERY_SCOPES", "RECONCILE"],
  realtime_drift: ["RECONCILE"],
  realtime_partition: ["CONTAIN", "RECONCILE", "ESCALATE"],
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
  mutation_freeze_violation: ["CONTAIN", "ESCALATE"],
  duplicate_committed_command: ["CONTAIN", "ESCALATE"],
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

const FAILURE_TO_RECOVERY_CLASSES: Record<RuntimeFailureKind, readonly RecoveryClass[]> = {
  stale_epoch: ["abort", "invalidate", "reconcile"],
  tenant_mismatch: ["rollback", "abort", "invalidate", "reconcile"],
  policy_denied: ["abort"],
  runtime_mode_block: ["contain"],
  realtime_drift: ["reconcile"],
  realtime_partition: ["rebuild", "invalidate", "reconcile"],
  workflow_divergence: ["reconcile", "abort"],
  barrier_timeout: ["contain"],
  coordination_partition: ["contain"],
  recovery_required: ["reconcile"],
  readonly_transition: ["contain", "invalidate"],
  auth_invalidation: ["contain", "rollback"],
  barrier_stall: ["contain"],
  transition_incomplete: ["reconcile"],
  workflow_mismatch: ["reconcile", "abort"],
  mutation_freeze_violation: ["contain"],
  duplicate_committed_command: ["manual_operator_action"],
};

export function recoveryClassesForFailure(kind: RuntimeFailureKind): readonly RecoveryClass[] {
  return FAILURE_TO_RECOVERY_CLASSES[kind];
}

const SEVERITY: Record<RuntimeFailureKind, "info" | "warning" | "critical"> = {
  stale_epoch: "warning",
  tenant_mismatch: "critical",
  policy_denied: "info",
  runtime_mode_block: "warning",
  realtime_drift: "warning",
  realtime_partition: "critical",
  workflow_divergence: "critical",
  barrier_timeout: "critical",
  coordination_partition: "critical",
  recovery_required: "warning",
  readonly_transition: "warning",
  auth_invalidation: "critical",
  barrier_stall: "critical",
  transition_incomplete: "warning",
  workflow_mismatch: "critical",
  mutation_freeze_violation: "critical",
  duplicate_committed_command: "critical",
};

export function semanticSeverity(kind: RuntimeFailureKind): "info" | "warning" | "critical" {
  return SEVERITY[kind];
}

const FAILURE_KIND: Record<RuntimeFailureKind, CanonicalFailureKind> = {
  stale_epoch: "stale_context",
  tenant_mismatch: "tenant_violation",
  policy_denied: "runtime_blocked",
  runtime_mode_block: "runtime_blocked",
  realtime_drift: "integrity_drift",
  realtime_partition: "external_dependency",
  workflow_divergence: "semantic_divergence",
  barrier_timeout: "transient",
  coordination_partition: "external_dependency",
  recovery_required: "integrity_drift",
  readonly_transition: "runtime_blocked",
  auth_invalidation: "tenant_violation",
  barrier_stall: "invariant_violation",
  transition_incomplete: "transient",
  workflow_mismatch: "semantic_divergence",
  mutation_freeze_violation: "invariant_violation",
  duplicate_committed_command: "replay_rejected",
};

const ACTION_TO_EFFECT: Partial<Record<SemanticAction, RuntimeEffect>> = {
  DENY: "deny",
  RETRY: "retry",
  RECONCILE: "reconcile",
  COMPENSATE: "compensate",
  CONTAIN: "contain",
  PAUSE_CHECKPOINTS: "pause",
  ABORT: "abort",
  FAIL_SAFE: "fail_safe",
  TEARDOWN: "abort",
  INVALIDATE_QUERY_SCOPES: "reconcile",
  ESCALATE: "operator_required",
};

const OPERATOR_VISIBILITY: Record<RuntimeFailureKind, OperatorVisibility> = {
  stale_epoch: "timeline",
  tenant_mismatch: "incident",
  policy_denied: "timeline",
  runtime_mode_block: "alert",
  realtime_drift: "timeline",
  realtime_partition: "incident",
  workflow_divergence: "incident",
  barrier_timeout: "alert",
  coordination_partition: "incident",
  recovery_required: "alert",
  readonly_transition: "alert",
  auth_invalidation: "incident",
  barrier_stall: "incident",
  transition_incomplete: "timeline",
  workflow_mismatch: "incident",
  mutation_freeze_violation: "incident",
  duplicate_committed_command: "incident",
};

const REPLAY_SAFETY: Record<RuntimeFailureKind, ReplaySafety> = {
  stale_epoch: "safe",
  tenant_mismatch: "unsafe",
  policy_denied: "conditional",
  runtime_mode_block: "conditional",
  realtime_drift: "safe",
  realtime_partition: "safe",
  workflow_divergence: "conditional",
  barrier_timeout: "safe",
  coordination_partition: "conditional",
  recovery_required: "conditional",
  readonly_transition: "conditional",
  auth_invalidation: "unsafe",
  barrier_stall: "conditional",
  transition_incomplete: "safe",
  workflow_mismatch: "conditional",
  mutation_freeze_violation: "unsafe",
  duplicate_committed_command: "unsafe",
};

const CONTAINMENT_BEHAVIOR: Partial<Record<RuntimeFailureKind, string>> = {
  runtime_mode_block: "writes_denied_by_runtime_mode",
  realtime_partition: "rebuild_realtime_then_reconcile",
  barrier_timeout: "freeze_mutations_and_fail_safe",
  coordination_partition: "contain_cross_tab_coordination",
  readonly_transition: "pause_checkpoints_and_invalidate_queries",
  auth_invalidation: "contain_and_teardown_auth_state",
  barrier_stall: "enter_fail_safe_until_operator_review",
  mutation_freeze_violation: "freeze_writes_and_escalate",
  duplicate_committed_command: "operator_review_before_replay",
};

export function canonicalFailureKind(kind: RuntimeFailureKind): CanonicalFailureKind {
  return FAILURE_KIND[kind];
}

export function runtimeEffectForActions(actions: readonly SemanticAction[]): RuntimeEffect {
  for (const action of actions) {
    const effect = ACTION_TO_EFFECT[action];
    if (effect) return effect;
  }
  return "none";
}

export function operatorVisibility(kind: RuntimeFailureKind): OperatorVisibility {
  return OPERATOR_VISIBILITY[kind];
}

export function replaySafety(kind: RuntimeFailureKind): ReplaySafety {
  return REPLAY_SAFETY[kind];
}

export function containmentBehavior(kind: RuntimeFailureKind): string | undefined {
  return CONTAINMENT_BEHAVIOR[kind];
}

export function recoveryContractForFailure(kind: RuntimeFailureKind): RecoveryContract {
  const actions = RUNTIME_SEMANTIC_REGISTRY[kind];
  const safety = replaySafety(kind);
  const requiresOperator = actions.includes("ESCALATE") || recoveryClassesForFailure(kind).includes("manual_operator_action");
  return {
    automatic: !requiresOperator,
    retryable: actions.includes("RETRY") || kind === "transition_incomplete" || kind === "barrier_timeout",
    replaySafe: safety === "safe",
    requiresReconciliation: actions.includes("RECONCILE") || actions.includes("INVALIDATE_QUERY_SCOPES"),
    requiresOperator,
    containmentBehavior: containmentBehavior(kind),
  };
}
