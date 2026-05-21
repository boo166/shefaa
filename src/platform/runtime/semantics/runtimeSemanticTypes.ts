import type { RuntimeMode } from "@/platform/runtime/policy/runtimePolicy";
import type { RuntimeHealth } from "@/platform/runtime/recovery/runtimeHealthStore";

/** Legacy recovery vocabulary consumed by transition / snapshot code paths. */
export type RecoveryStrategy =
  | "abort"
  | "reconcile"
  | "compensate"
  | "checkpoint_pause"
  | "teardown"
  | "containment"
  | "safe_mode";

export type RecoveryClass =
  | "reconcile"
  | "rollback"
  | "invalidate"
  | "abort"
  | "rebuild"
  | "contain"
  | "manual_operator_action";

/** Subset of {@link RuntimeFailureKind} handled by {@link resolveRecoveryPolicy}. */
export type RecoveryFailureKind =
  | "stale_epoch"
  | "realtime_drift"
  | "realtime_partition"
  | "workflow_mismatch"
  | "workflow_divergence"
  | "readonly_transition"
  | "tenant_mismatch"
  | "auth_invalidation"
  | "barrier_stall"
  | "transition_incomplete"
  | "mutation_freeze_violation"
  | "duplicate_committed_command";

export type RecoveryPolicyResolution = {
  strategy: RecoveryStrategy;
  recoveryClass: RecoveryClass;
  orderedClasses: readonly RecoveryClass[];
  automatic: boolean;
  requiresOperator: boolean;
};

/**
 * Canonical failure / instability kinds — one vocabulary for workflows, queries, realtime, middleware, recovery.
 * Subsystems map local errors here; {@link resolveSemanticAction} defines law.
 */
export type RuntimeFailureKind =
  | "stale_epoch"
  | "tenant_mismatch"
  | "policy_denied"
  | "runtime_mode_block"
  | "realtime_drift"
  | "realtime_partition"
  | "workflow_divergence"
  | "barrier_timeout"
  | "coordination_partition"
  | "recovery_required"
  | "readonly_transition"
  | "auth_invalidation"
  | "barrier_stall"
  | "transition_incomplete"
  | "workflow_mismatch"
  | "mutation_freeze_violation"
  | "duplicate_committed_command";

export type OperationalEvidenceCategory =
  | "domain"
  | "workflow"
  | "reconciliation"
  | "runtime_transition"
  | "recovery"
  | "notification"
  | "audit"
  | "operator_action";

export type CanonicalFailureKind =
  | "transient"
  | "stale_context"
  | "tenant_violation"
  | "replay_rejected"
  | "invariant_violation"
  | "runtime_blocked"
  | "semantic_divergence"
  | "integrity_drift"
  | "external_dependency"
  | "operator_action_required";

export type RuntimeEffect =
  | "none"
  | "deny"
  | "retry"
  | "reconcile"
  | "compensate"
  | "contain"
  | "pause"
  | "abort"
  | "fail_safe"
  | "operator_required";

export type OperatorVisibility = "hidden" | "timeline" | "alert" | "incident";

export type ReplaySafety = "safe" | "conditional" | "unsafe";

export type RecoveryContract = {
  automatic: boolean;
  retryable: boolean;
  replaySafe: boolean;
  requiresReconciliation: boolean;
  requiresOperator: boolean;
  containmentBehavior?: string;
};

export type OperationalTraceIds = {
  requestTraceId?: string;
  operationTraceId?: string;
  workflowTraceId?: string;
  transitionId?: string;
  reconciliationRunId?: string;
  causalParentId?: string;
};

export type OperationalEvidenceEnvelope = {
  id: string;
  category: OperationalEvidenceCategory;
  severity: "info" | "warning" | "critical";
  failureKind: CanonicalFailureKind;
  runtimeEffect: RuntimeEffect;
  recoveryContract: RecoveryContract;
  traceIds: OperationalTraceIds;
  runtimeMode?: string;
  tenantId?: string;
  createdAt: string;
  label?: string;
  detail?: string;
  source?: string;
  sourceId?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

/** Canonical reactions the kernel and participants may execute (ordering is transition-specific). */
export type SemanticAction =
  | "ABORT"
  | "RETRY"
  | "RECONCILE"
  | "COMPENSATE"
  | "CONTAIN"
  | "ESCALATE"
  | "FAIL_SAFE"
  | "DENY"
  | "INVALIDATE_QUERY_SCOPES"
  | "TEARDOWN"
  | "PAUSE_CHECKPOINTS";

export type RuntimeTransitionClass =
  | "identity"
  | "tenant"
  | "containment"
  | "policy"
  | "recovery"
  | "incident";

export type SemanticResolution = {
  kind: RuntimeFailureKind;
  failureKind: CanonicalFailureKind;
  runtimeEffect: RuntimeEffect;
  /** Ordered interpretation of platform law for this failure. */
  actions: readonly SemanticAction[];
  /** Back-compat bridge for existing {@link resolveRecoveryPolicy} callers. */
  recoveryStrategy: RecoveryStrategy;
  recoveryContract: RecoveryContract;
  operatorVisibility: OperatorVisibility;
  replaySafety: ReplaySafety;
  requiresReconciliation: boolean;
  containmentBehavior?: string;
  uiSeverity: "info" | "warning" | "critical";
};

/**
 * Single effective operational snapshot — mode (intent) vs health (observed) vs gates.
 */
export type EffectiveRuntimeState = {
  mode: RuntimeMode;
  modeVersion: number;
  health: RuntimeHealth;
  writesFrozen: boolean;
  tenantBarrierDepth: number;
  writesAllowed: boolean;
  workflowsAllowed: boolean;
  /** Realtime convergence posture (intent derived from mode + health). */
  realtimePosture: "NORMAL" | "READONLY" | "PAUSED";
  uiSeverity: "none" | "info" | "warning" | "critical";
};

/** Documented coordination contracts (guarantees consumers may rely on). */
export type CoordinationEventContract =
  | "TENANT_CONTEXT_CHANGED"
  | "RUNTIME_MODE_CHANGED"
  | "WORKFLOW_ABORTED"
  | "REALTIME_RECONCILED";

export const COORDINATION_CONTRACTS: Record<
  CoordinationEventContract,
  readonly string[]
> = {
  TENANT_CONTEXT_CHANGED: [
    "epoch bumped or adopted before fan-out",
    "mutation freeze released only after transition completes",
    "single publish per tenant_switch transaction",
  ],
  RUNTIME_MODE_CHANGED: [
    "payload.runtimeModeVersion >= stale versions rejected on bus",
    "resolveRuntimePolicy uses post-commit effective mode",
  ],
  WORKFLOW_ABORTED: ["checkpoints cleared for aborted ids", "workflow registry cleared for transition abort"],
  REALTIME_RECONCILED: ["registry intents diffed", "policy filter applied on attach"],
};
