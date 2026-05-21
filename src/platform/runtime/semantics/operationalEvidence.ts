import { resolveSemanticAction } from "./resolveSemanticAction";
import type {
  CanonicalFailureKind,
  OperationalEvidenceCategory,
  OperationalEvidenceEnvelope,
  OperationalTraceIds,
  RecoveryContract,
  RuntimeEffect,
  RuntimeFailureKind,
} from "./runtimeSemanticTypes";

type Traceish = {
  request_trace_id?: string | null;
  operation_trace_id?: string | null;
  workflow_trace_id?: string | null;
  runtime_transition_trace_id?: string | null;
  transition_id?: string | null;
  reconciliation_run_id?: string | null;
  causal_parent_id?: string | null;
  trace_ids?: Record<string, string | null | undefined> | null;
};

type EnvelopeInput = {
  id: string;
  category: OperationalEvidenceCategory;
  source: string;
  sourceId?: string | null;
  createdAt: string;
  tenantId?: string | null;
  runtimeMode?: string | null;
  runtimeKind?: RuntimeFailureKind;
  failureKind?: CanonicalFailureKind;
  runtimeEffect?: RuntimeEffect;
  severity?: "info" | "warning" | "critical";
  recoveryContract?: Partial<RecoveryContract>;
  traceIds?: OperationalTraceIds;
  label?: string;
  detail?: string;
  metadata?: OperationalEvidenceEnvelope["metadata"];
};

const DEFAULT_RECOVERY_CONTRACT: RecoveryContract = {
  automatic: true,
  retryable: false,
  replaySafe: false,
  requiresReconciliation: false,
  requiresOperator: false,
};

function firstTrace(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => Boolean(value)) ?? undefined;
}

export function extractOperationalTraceIds(row: Traceish): OperationalTraceIds {
  const traceIds = row.trace_ids ?? {};
  return {
    requestTraceId: firstTrace(row.request_trace_id, traceIds.requestTraceId, traceIds.request_trace_id, traceIds.trace_id),
    operationTraceId: firstTrace(row.operation_trace_id, traceIds.operationTraceId, traceIds.operation_trace_id),
    workflowTraceId: firstTrace(row.workflow_trace_id, traceIds.workflowTraceId, traceIds.workflow_trace_id),
    transitionId: firstTrace(row.transition_id, row.runtime_transition_trace_id, traceIds.transitionId, traceIds.runtimeTransitionTraceId, traceIds.runtime_transition_trace_id),
    reconciliationRunId: firstTrace(row.reconciliation_run_id, traceIds.reconciliationRunId, traceIds.reconciliation_run_id),
    causalParentId: firstTrace(row.causal_parent_id, traceIds.causalParentId, traceIds.causal_parent_id),
  };
}

export function primaryTraceId(traceIds: OperationalTraceIds): string | undefined {
  return traceIds.workflowTraceId
    ?? traceIds.operationTraceId
    ?? traceIds.requestTraceId
    ?? traceIds.transitionId
    ?? traceIds.reconciliationRunId
    ?? traceIds.causalParentId;
}

export function createOperationalEvidenceEnvelope(input: EnvelopeInput): OperationalEvidenceEnvelope {
  const semantic = input.runtimeKind ? resolveSemanticAction(input.runtimeKind) : null;
  const recoveryContract = {
    ...(semantic?.recoveryContract ?? DEFAULT_RECOVERY_CONTRACT),
    ...input.recoveryContract,
  };
  return {
    id: input.id,
    category: input.category,
    severity: input.severity ?? semantic?.uiSeverity ?? "info",
    failureKind: input.failureKind ?? semantic?.failureKind ?? "transient",
    runtimeEffect: input.runtimeEffect ?? semantic?.runtimeEffect ?? "none",
    recoveryContract,
    traceIds: input.traceIds ?? {},
    runtimeMode: input.runtimeMode ?? undefined,
    tenantId: input.tenantId ?? undefined,
    createdAt: input.createdAt,
    label: input.label,
    detail: input.detail,
    source: input.source,
    sourceId: input.sourceId ?? input.id,
    metadata: input.metadata,
  };
}

function reconciliationFailureKind(code: string | null | undefined): CanonicalFailureKind {
  const normalized = (code ?? "").toLowerCase();
  if (normalized.includes("duplicate")) return "replay_rejected";
  if (normalized.includes("tenant")) return "tenant_violation";
  if (normalized.includes("integrity") || normalized.includes("drift") || normalized.includes("mismatch")) {
    return "integrity_drift";
  }
  return "integrity_drift";
}

function outboxFailureKind(input: { status?: string | null; last_error?: string | null; last_error_code?: string | null }): CanonicalFailureKind {
  const status = input.status ?? "";
  const code = `${input.last_error_code ?? ""} ${input.last_error ?? ""}`.toLowerCase();
  if (status === "DEAD_LETTER") return "operator_action_required";
  if (code.includes("rate") || code.includes("network") || code.includes("timeout") || code.includes("transient")) return "transient";
  if (code.includes("permission") || code.includes("tenant")) return "tenant_violation";
  if (code.includes("handler") || code.includes("external")) return "external_dependency";
  return status === "FAILED" || status === "RETRY" ? "external_dependency" : "transient";
}

export function evidenceFromReconciliationRun(run: {
  id: string;
  tenant_id?: string | null;
  status: string;
  finding_count: number;
  critical_count: number;
  request_trace_id?: string | null;
  operation_trace_id?: string | null;
  workflow_trace_id?: string | null;
  completed_at: string;
}): OperationalEvidenceEnvelope {
  return createOperationalEvidenceEnvelope({
    id: `reconciliation-run:${run.id}`,
    category: "reconciliation",
    source: "billing_reconciliation_runs",
    sourceId: run.id,
    tenantId: run.tenant_id,
    createdAt: run.completed_at,
    severity: run.status === "failed" || run.critical_count > 0 ? "critical" : run.finding_count > 0 ? "warning" : "info",
    failureKind: run.status === "failed" ? "external_dependency" : "integrity_drift",
    runtimeEffect: run.critical_count > 0 ? "reconcile" : "none",
    recoveryContract: {
      automatic: true,
      retryable: run.status === "failed",
      replaySafe: false,
      requiresReconciliation: run.finding_count > 0,
      requiresOperator: run.critical_count > 0,
    },
    traceIds: {
      ...extractOperationalTraceIds(run),
      reconciliationRunId: run.id,
    },
    label: run.status,
    detail: `${run.finding_count} findings, ${run.critical_count} critical`,
    metadata: { findingCount: run.finding_count, criticalCount: run.critical_count },
  });
}

export function evidenceFromDryReconciliationSummary(summary: {
  completed_at: string;
  finding_count: number;
  critical_count: number;
}): OperationalEvidenceEnvelope {
  return createOperationalEvidenceEnvelope({
    id: `reconciliation-dry:${summary.completed_at}`,
    category: "reconciliation",
    source: "billing_reconciliation_dry_run",
    createdAt: summary.completed_at,
    severity: summary.critical_count > 0 ? "critical" : summary.finding_count > 0 ? "warning" : "info",
    failureKind: "integrity_drift",
    runtimeEffect: summary.finding_count > 0 ? "reconcile" : "none",
    recoveryContract: {
      automatic: false,
      retryable: false,
      replaySafe: false,
      requiresReconciliation: summary.finding_count > 0,
      requiresOperator: summary.critical_count > 0,
    },
    label: "completed",
    detail: `${summary.finding_count} findings, ${summary.critical_count} critical`,
    metadata: { findingCount: summary.finding_count, criticalCount: summary.critical_count },
  });
}

export function evidenceFromReconciliationFinding(finding: {
  id: string;
  run_id: string;
  tenant_id?: string | null;
  finding_code: string;
  severity: "critical" | "warning";
  status: string;
  request_trace_id?: string | null;
  operation_trace_id?: string | null;
  workflow_trace_id?: string | null;
  detected_at: string;
}): OperationalEvidenceEnvelope {
  return createOperationalEvidenceEnvelope({
    id: `finding:${finding.id}`,
    category: "reconciliation",
    source: "billing_reconciliation_findings",
    sourceId: finding.id,
    tenantId: finding.tenant_id,
    createdAt: finding.detected_at,
    severity: finding.severity,
    failureKind: reconciliationFailureKind(finding.finding_code),
    runtimeEffect: "reconcile",
    recoveryContract: {
      automatic: false,
      retryable: false,
      replaySafe: false,
      requiresReconciliation: true,
      requiresOperator: finding.severity === "critical",
    },
    traceIds: {
      ...extractOperationalTraceIds(finding),
      reconciliationRunId: finding.run_id,
      causalParentId: primaryTraceId(extractOperationalTraceIds(finding)),
    },
    label: `${finding.severity} ${finding.status}`,
    detail: finding.finding_code,
    metadata: { findingCode: finding.finding_code, status: finding.status },
  });
}

export function evidenceFromRuntimeTransition(row: {
  id: string;
  transition_id: string;
  transition_type: string;
  status: string;
  tenant_id?: string | null;
  runtime_transition_trace_id?: string | null;
  trace_id?: string | null;
  started_at: string;
  rollback_triggered?: boolean;
}): OperationalEvidenceEnvelope {
  const failed = row.status === "failed" || row.rollback_triggered;
  return createOperationalEvidenceEnvelope({
    id: `transition:${row.id}`,
    category: "runtime_transition",
    source: "runtime_transition_log",
    sourceId: row.id,
    tenantId: row.tenant_id,
    createdAt: row.started_at,
    runtimeKind: failed ? "transition_incomplete" : undefined,
    failureKind: failed ? undefined : "transient",
    runtimeEffect: failed ? undefined : "none",
    traceIds: {
      ...extractOperationalTraceIds({
        ...row,
        request_trace_id: row.trace_id,
        transition_id: row.transition_id,
      }),
      transitionId: row.transition_id,
    },
    label: row.status,
    detail: row.transition_type,
    metadata: { rollbackTriggered: Boolean(row.rollback_triggered) },
  });
}

export function evidenceFromRuntimeIncident(row: {
  id: string;
  tenant_id?: string | null;
  incident_type: RuntimeFailureKind | string;
  severity: "info" | "warning" | "critical";
  runtime_health: string;
  runtime_mode: string;
  trace_ids?: Record<string, string | null | undefined> | null;
  detected_at: string;
}): OperationalEvidenceEnvelope {
  const runtimeKind = row.incident_type as RuntimeFailureKind;
  return createOperationalEvidenceEnvelope({
    id: `incident:${row.id}`,
    category: "recovery",
    source: "runtime_incident_timeline",
    sourceId: row.id,
    tenantId: row.tenant_id,
    runtimeMode: row.runtime_mode,
    createdAt: row.detected_at,
    runtimeKind,
    severity: row.severity,
    traceIds: extractOperationalTraceIds(row),
    label: row.severity,
    detail: `${row.incident_type}; health ${row.runtime_health}`,
    metadata: { runtimeHealth: row.runtime_health },
  });
}

export function evidenceFromRecoveryAction(row: {
  id: string;
  incident_id: string;
  tenant_id?: string | null;
  recovery_class: string;
  action_status: string;
  triggered_by: "automatic" | "operator";
  trace_ids?: Record<string, string | null | undefined> | null;
  started_at: string;
}): OperationalEvidenceEnvelope {
  const requiresOperator = row.action_status === "operator_required" || row.triggered_by === "operator";
  return createOperationalEvidenceEnvelope({
    id: `recovery:${row.id}`,
    category: requiresOperator ? "operator_action" : "recovery",
    source: "runtime_recovery_actions",
    sourceId: row.id,
    tenantId: row.tenant_id,
    createdAt: row.started_at,
    failureKind: requiresOperator ? "operator_action_required" : "integrity_drift",
    runtimeEffect: requiresOperator ? "operator_required" : row.recovery_class === "abort" ? "abort" : row.recovery_class === "contain" ? "contain" : "reconcile",
    recoveryContract: {
      automatic: row.triggered_by === "automatic",
      retryable: row.action_status === "failed",
      replaySafe: false,
      requiresReconciliation: row.recovery_class === "reconcile" || row.recovery_class === "rebuild",
      requiresOperator,
    },
    traceIds: {
      ...extractOperationalTraceIds(row),
      causalParentId: row.incident_id,
    },
    label: row.action_status,
    detail: `${row.recovery_class} by ${row.triggered_by}`,
    metadata: { incidentId: row.incident_id, recoveryClass: row.recovery_class },
  });
}

export function evidenceFromEventOutbox(row: {
  id: string;
  tenant_id?: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id?: string | null;
  handler_name: string;
  delivery_guarantee: string;
  status: string;
  attempts: number;
  max_attempts: number;
  next_retry_at?: string | null;
  processed_at?: string | null;
  last_error?: string | null;
  last_error_code?: string | null;
  request_trace_id?: string | null;
  operation_trace_id?: string | null;
  workflow_trace_id?: string | null;
  causal_parent_id?: string | null;
  created_at: string;
  updated_at?: string | null;
}): OperationalEvidenceEnvelope {
  const activeFailure = row.status === "FAILED" || row.status === "RETRY" || row.status === "DEAD_LETTER";
  return createOperationalEvidenceEnvelope({
    id: `outbox:${row.id}`,
    category: "domain",
    source: "event_outbox",
    sourceId: row.id,
    tenantId: row.tenant_id,
    createdAt: row.updated_at ?? row.created_at,
    severity: row.status === "DEAD_LETTER" ? "critical" : activeFailure ? "warning" : "info",
    failureKind: outboxFailureKind(row),
    runtimeEffect: row.status === "RETRY" ? "retry" : row.status === "DEAD_LETTER" ? "operator_required" : activeFailure ? "retry" : "none",
    recoveryContract: {
      automatic: row.status !== "DEAD_LETTER",
      retryable: row.status === "FAILED" || row.status === "RETRY",
      replaySafe: row.delivery_guarantee !== "best_effort" && row.status !== "DELIVERED",
      requiresReconciliation: false,
      requiresOperator: row.status === "DEAD_LETTER",
      containmentBehavior: row.status === "DEAD_LETTER" ? "operator_replay_or_dead_letter_review" : undefined,
    },
    traceIds: {
      ...extractOperationalTraceIds(row),
      causalParentId: row.causal_parent_id ?? row.workflow_trace_id ?? row.operation_trace_id ?? row.request_trace_id ?? undefined,
    },
    label: row.status,
    detail: `${row.event_type} via ${row.handler_name}`,
    metadata: {
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      handlerName: row.handler_name,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
    },
  });
}

export function sortOperationalEvidence(items: OperationalEvidenceEnvelope[], limit = 16): OperationalEvidenceEnvelope[] {
  return items
    .filter((item) => item.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
