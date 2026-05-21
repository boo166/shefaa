import { describe, expect, it, vi } from "vitest";
import * as runtimeAnalytics from "@/platform/observability/runtimeAnalytics";
import {
  evidenceFromEventOutbox,
  evidenceFromReconciliationFinding,
  evidenceFromRecoveryAction,
  evidenceFromRuntimeTransition,
  primaryTraceId,
} from "@/platform/runtime/semantics/operationalEvidence";

describe("operational evidence envelopes", () => {
  it("normalizes billing reconciliation findings without collapsing category, failure, effect, and recovery", () => {
    const envelope = evidenceFromReconciliationFinding({
      id: "finding-1",
      run_id: "run-1",
      tenant_id: "tenant-1",
      finding_code: "INVOICE_PAYMENT_TOTAL_MISMATCH",
      severity: "critical",
      status: "OPEN",
      request_trace_id: "req-1",
      operation_trace_id: "op-1",
      workflow_trace_id: "wf-1",
      detected_at: "2026-05-21T10:00:00.000Z",
    });

    expect(envelope).toMatchObject({
      category: "reconciliation",
      severity: "critical",
      failureKind: "integrity_drift",
      runtimeEffect: "reconcile",
      tenantId: "tenant-1",
      traceIds: {
        requestTraceId: "req-1",
        operationTraceId: "op-1",
        workflowTraceId: "wf-1",
        reconciliationRunId: "run-1",
      },
      recoveryContract: {
        automatic: false,
        replaySafe: false,
        requiresReconciliation: true,
        requiresOperator: true,
      },
    });
  });

  it("marks dead-lettered outbox evidence as operator-required and replay-reviewable", () => {
    const envelope = evidenceFromEventOutbox({
      id: "outbox-1",
      tenant_id: "tenant-1",
      event_type: "InvoicePaid",
      aggregate_type: "invoice",
      aggregate_id: "invoice-1",
      handler_name: "audit",
      delivery_guarantee: "exactly_once_persistence",
      status: "DEAD_LETTER",
      attempts: 5,
      max_attempts: 5,
      last_error: "handler failed",
      request_trace_id: "req-1",
      operation_trace_id: "op-1",
      workflow_trace_id: "wf-1",
      created_at: "2026-05-21T10:00:00.000Z",
      updated_at: "2026-05-21T10:01:00.000Z",
    });

    expect(envelope.failureKind).toBe("operator_action_required");
    expect(envelope.runtimeEffect).toBe("operator_required");
    expect(envelope.recoveryContract).toMatchObject({
      automatic: false,
      retryable: false,
      replaySafe: true,
      requiresOperator: true,
    });
    expect(primaryTraceId(envelope.traceIds)).toBe("wf-1");
  });

  it("uses runtime semantics for failed transitions and recovery incidents", () => {
    const emit = vi.spyOn(runtimeAnalytics, "emitPlatformMetric").mockImplementation(() => undefined);
    const transition = evidenceFromRuntimeTransition({
      id: "row-1",
      transition_id: "transition-1",
      transition_type: "tenant_switch",
      status: "failed",
      tenant_id: "tenant-1",
      trace_id: "req-1",
      runtime_transition_trace_id: "rtx-1",
      started_at: "2026-05-21T10:00:00.000Z",
      rollback_triggered: true,
    });
    const recovery = evidenceFromRecoveryAction({
      id: "action-1",
      incident_id: "incident-1",
      tenant_id: "tenant-1",
      recovery_class: "manual_operator_action",
      action_status: "operator_required",
      triggered_by: "operator",
      trace_ids: { trace_id: "req-1" },
      started_at: "2026-05-21T10:01:00.000Z",
    });
    emit.mockRestore();

    expect(transition.failureKind).toBe("transient");
    expect(transition.runtimeEffect).toBe("reconcile");
    expect(transition.recoveryContract.requiresReconciliation).toBe(true);
    expect(recovery.category).toBe("operator_action");
    expect(recovery.runtimeEffect).toBe("operator_required");
    expect(recovery.traceIds.causalParentId).toBe("incident-1");
  });
});
