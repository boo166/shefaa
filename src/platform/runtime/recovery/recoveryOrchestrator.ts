import { useAuth } from "@/core/auth/authStore";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { disconnectAllRegisteredRealtime, reconcileAll } from "@/platform/realtime/realtimeRuntime";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import type { RuntimeMode } from "@/platform/runtime/policy";
import { resolveRecoveryPolicy } from "@/platform/runtime/policy/resolveRecoveryPolicy";
import type {
  RecoveryClass,
  RecoveryFailureKind,
} from "@/platform/runtime/semantics/runtimeSemanticTypes";
import { semanticSeverity } from "@/platform/runtime/semantics/runtimeSemanticRegistry";
import { resolveSemanticAction } from "@/platform/runtime/semantics/resolveSemanticAction";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";
import { persistRuntimeIncidentLedger } from "@/services/runtime/runtimeIncidentLedger.repository";
import { runtimeHealthStore, type RuntimeHealth } from "./runtimeHealthStore";

export type RuntimeTrustLevel =
  | "HEALTHY"
  | "OBSERVED"
  | "DEGRADED"
  | "CONTAINED"
  | "UNTRUSTED";

export type RecoveryAuditEntry = {
  id: string;
  occurredAt: number;
  tenantId: string | null;
  actorId: string | null;
  reason: string;
  failure: RecoveryFailureKind;
  recoveryClass: RecoveryClass;
  automatic: boolean;
  requiresOperator: boolean;
  runtimeHealth: RuntimeHealth;
  trustLevel: RuntimeTrustLevel;
  traceId: string | null;
  workflowSnapshot: string[];
  action: "started" | "applied" | "operator_required" | "failed";
};

export type RecoveryRequest = {
  failure: RecoveryFailureKind;
  tenantId?: string | null;
  actorId?: string | null;
  reason: string;
  traceId?: string | null;
};

const MAX_AUDIT_ENTRIES = 80;
const auditTrail: RecoveryAuditEntry[] = [];
const listeners = new Set<() => void>();

function newRecoveryId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function notify() {
  for (const listener of listeners) listener();
}

function pushAudit(entry: RecoveryAuditEntry) {
  auditTrail.push(entry);
  while (auditTrail.length > MAX_AUDIT_ENTRIES) auditTrail.shift();
  notify();
}

function trustFromDamage(input: {
  failure: RecoveryFailureKind;
  requiresOperator: boolean;
  activeWorkflowCount: number;
}): RuntimeTrustLevel {
  if (input.requiresOperator) return "UNTRUSTED";
  if (input.failure === "barrier_stall" || input.failure === "coordination_partition") return "UNTRUSTED";
  if (input.failure === "mutation_freeze_violation" || input.failure === "realtime_partition") return "CONTAINED";
  if (semanticSeverity(input.failure) === "critical") return "CONTAINED";
  if (input.activeWorkflowCount > 0) return "DEGRADED";
  return "OBSERVED";
}

function healthFromTrust(trustLevel: RuntimeTrustLevel): RuntimeHealth {
  switch (trustLevel) {
    case "UNTRUSTED":
      return "FAILED_SAFE";
    case "CONTAINED":
      return "CONTAINED";
    case "DEGRADED":
    case "OBSERVED":
      return "DEGRADED";
    default:
      return "HEALTHY";
  }
}

function applyRecoveryClass(recoveryClass: RecoveryClass, reason: string) {
  switch (recoveryClass) {
    case "abort":
      workflowRuntimeRegistry.clearAll();
      break;
    case "rebuild":
      disconnectAllRegisteredRealtime();
      reconcileAll({ force: true });
      break;
    case "invalidate":
    case "reconcile":
      reconcileAll({ force: true });
      break;
    case "contain":
      runtimeMutationGate.freezeWrites(`recovery:${reason}`);
      break;
    case "rollback":
    case "manual_operator_action":
      break;
  }
}

function triggeredBy(entry: RecoveryAuditEntry): "automatic" | "operator" {
  return entry.automatic ? "automatic" : "operator";
}

function actionStatus(entry: RecoveryAuditEntry) {
  if (entry.action === "applied") return "completed";
  return entry.action;
}

function safeReasonCode(reason: string): string {
  return /^[a-z0-9_.:-]{1,80}$/i.test(reason) ? reason : "runtime_recovery";
}

function persistAuditTrailSnapshot(input: {
  started: RecoveryAuditEntry;
  entries: RecoveryAuditEntry[];
  runtimeMode: RuntimeMode;
  severity: "info" | "warning" | "critical";
}) {
  const semantic = resolveSemanticAction(input.started.failure);
  const traceIds = {
    trace_id: input.started.traceId,
    requestTraceId: input.started.traceId,
    workflow_trace_id: null,
    causal_parent_id: input.started.traceId,
  };
  void persistRuntimeIncidentLedger({
    incident: {
      tenant_id: input.started.tenantId,
      actor_id: input.started.actorId,
      incident_type: input.started.failure,
      runtime_health: input.started.runtimeHealth,
      runtime_mode: input.runtimeMode,
      severity: input.severity,
      trace_ids: traceIds,
      causal_parent_id: input.started.traceId,
      failure_kind: semantic.failureKind,
      runtime_effect: semantic.runtimeEffect,
      recovery_contract: semantic.recoveryContract,
      evidence_metadata: {
        operator_visibility: semantic.operatorVisibility,
        replay_safety: semantic.replaySafety,
        requires_reconciliation: semantic.requiresReconciliation,
      },
      metadata: {
        recovery_class: input.started.recoveryClass,
        trust_level: input.started.trustLevel,
        requires_operator: input.started.requiresOperator,
        workflow_count: input.started.workflowSnapshot.length,
        reason_code: safeReasonCode(input.started.reason),
      },
      detected_at: new Date(input.started.occurredAt).toISOString(),
    },
    actions: input.entries.map((entry) => ({
      tenant_id: entry.tenantId,
      actor_id: entry.actorId,
      recovery_class: entry.recoveryClass,
      action_status: actionStatus(entry),
      triggered_by: triggeredBy(entry),
      trace_ids: traceIds,
      causal_parent_id: input.started.id,
      failure_kind: semantic.failureKind,
      runtime_effect: entry.action === "operator_required" ? "operator_required" : semantic.runtimeEffect,
      recovery_contract: {
        ...semantic.recoveryContract,
        automatic: entry.automatic,
        requiresOperator: entry.requiresOperator,
      },
      evidence_metadata: {
        operator_visibility: semantic.operatorVisibility,
        replay_safety: semantic.replaySafety,
        action: entry.action,
      },
      action_metadata: {
        failure: entry.failure,
        runtime_health: entry.runtimeHealth,
        trust_level: entry.trustLevel,
        workflow_count: entry.workflowSnapshot.length,
        reason_code: safeReasonCode(entry.reason),
      },
      started_at: new Date(entry.occurredAt).toISOString(),
      completed_at: entry.action === "started" ? null : new Date(entry.occurredAt).toISOString(),
    })),
  });
}

export const recoveryOrchestrator = {
  evaluate(input: RecoveryRequest) {
    const policy = resolveRecoveryPolicy(input.failure);
    const workflowSnapshot = workflowRuntimeRegistry.listActive();
    const trustLevel = trustFromDamage({
      failure: input.failure,
      requiresOperator: policy.requiresOperator,
      activeWorkflowCount: workflowSnapshot.length,
    });
    return {
      policy,
      workflowSnapshot,
      trustLevel,
      runtimeHealth: healthFromTrust(trustLevel),
    };
  },

  recover(input: RecoveryRequest): RecoveryAuditEntry[] {
    const recoveryId = newRecoveryId();
    const evaluation = this.evaluate(input);
    const entries: RecoveryAuditEntry[] = [];
    const authState = useAuth.getState();
    const runtimeMode = runtimeModeController.getSnapshot().effective.effectiveMode;
    const severity = semanticSeverity(input.failure);
    const started: RecoveryAuditEntry = {
      id: recoveryId,
      occurredAt: Date.now(),
      tenantId: input.tenantId ?? null,
      actorId: input.actorId ?? authState.user?.id ?? null,
      reason: input.reason,
      failure: input.failure,
      recoveryClass: evaluation.policy.recoveryClass,
      automatic: evaluation.policy.automatic,
      requiresOperator: evaluation.policy.requiresOperator,
      runtimeHealth: evaluation.runtimeHealth,
      trustLevel: evaluation.trustLevel,
      traceId: input.traceId ?? null,
      workflowSnapshot: evaluation.workflowSnapshot,
      action: "started",
    };
    pushAudit(started);
    entries.push(started);
    runtimeHealthStore.setHealth(evaluation.runtimeHealth);

    emitPlatformMetric("runtime.recovery.started", {
      failure: input.failure,
      recoveryClass: evaluation.policy.recoveryClass,
      automatic: evaluation.policy.automatic,
      requiresOperator: evaluation.policy.requiresOperator,
      tenantId: input.tenantId ?? "",
      traceId: input.traceId ?? "",
    });

    for (const recoveryClass of evaluation.policy.orderedClasses) {
      try {
        if (recoveryClass === "manual_operator_action") {
          const entry = { ...started, occurredAt: Date.now(), recoveryClass, action: "operator_required" as const };
          pushAudit(entry);
          entries.push(entry);
          continue;
        }
        applyRecoveryClass(recoveryClass, input.reason);
        const entry = { ...started, occurredAt: Date.now(), recoveryClass, action: "applied" as const };
        pushAudit(entry);
        entries.push(entry);
      } catch {
        const entry = { ...started, occurredAt: Date.now(), recoveryClass, action: "failed" as const };
        pushAudit(entry);
        entries.push(entry);
        runtimeHealthStore.setHealth("FAILED_SAFE");
      }
    }

    persistAuditTrailSnapshot({ started, entries, runtimeMode, severity });
    return entries;
  },

  getAuditTrail(): RecoveryAuditEntry[] {
    return [...auditTrail].reverse();
  },

  getTrustLevel(): RuntimeTrustLevel {
    const latest = auditTrail[auditTrail.length - 1];
    return latest?.trustLevel ?? "HEALTHY";
  },

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  clearForTests() {
    auditTrail.length = 0;
    notify();
  },
};
