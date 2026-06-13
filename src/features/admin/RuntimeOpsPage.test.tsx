import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { tenantId, authState } = vi.hoisted(() => {
  const tenantId = "00000000-0000-0000-0000-000000000111";
  return {
    tenantId,
    authState: {
      user: {
        id: "user-1",
        tenantId,
        globalRoles: ["super_admin"] as const,
        tenantRoles: [] as string[],
        tenantStatus: "active" as const,
      },
      tenantOverride: { id: tenantId, slug: "tenant-one", name: "Tenant One" },
    },
  };
});

vi.mock("@/core/auth/authStore", () => ({
  useAuth: Object.assign(() => authState, { getState: () => authState }),
  selectEffectiveTenantId: () => tenantId,
}));

vi.mock("@/platform/runtime/coordination/consistencyBarrier", () => ({
  consistencyBarrier: { getDepth: () => 0 },
}));

vi.mock("@/platform/runtime/coordination/coordinationDiagnostics", () => ({
  coordinationDiagnostics: {
    subscribe: () => () => {},
    getSnapshot: () => ({ activeTransitionKind: null, lastRejection: null }),
  },
}));

vi.mock("@/platform/runtime/coordination/runtimeEpochManager", () => ({
  runtimeEpochManager: {
    subscribe: () => () => {},
    getCurrentEpoch: () => 7,
  },
}));

vi.mock("@/platform/runtime/coordination/runtimeMutationGate", () => ({
  runtimeMutationGate: {
    isWritesFrozen: () => false,
    getFreezeReason: () => null,
  },
}));

vi.mock("@/platform/runtime/mode/runtimeModeController", () => ({
  runtimeModeController: {
    subscribe: () => () => {},
    getSnapshot: () => ({ effective: { effectiveMode: "NORMAL", version: 1 } }),
  },
}));

vi.mock("@/platform/runtime/recovery/runtimeHealthStore", () => ({
  runtimeHealthStore: {
    subscribe: () => () => {},
    getSnapshot: () => "HEALTHY",
  },
}));

vi.mock("@/platform/runtime/recovery/recoveryOrchestrator", () => ({
  recoveryOrchestrator: {
    subscribe: () => () => {},
    getTrustLevel: () => "OBSERVED",
    getAuditTrail: () => [{
      id: "recovery-1",
      occurredAt: new Date("2026-05-10T10:00:00.000Z").getTime(),
      tenantId: "00000000-0000-0000-0000-000000000111",
      actorId: "user-1",
      reason: "test recovery",
      failure: "realtime_partition",
      recoveryClass: "rebuild",
      automatic: true,
      requiresOperator: false,
      runtimeHealth: "CONTAINED",
      trustLevel: "CONTAINED",
      traceId: "trace-recovery-1",
      workflowSnapshot: [],
      action: "applied",
    }],
  },
}));

vi.mock("@/platform/realtime/realtimeRuntime", () => ({
  subscribeEntity: () => ({ unsubscribe: () => {} }),
  getRealtimeRegistryDiagnostics: () => ({
    intentCount: 2,
    activeChannelCount: 1,
    churnThrottledRecently: false,
    connectionState: "CONNECTED",
    maxReplayDriftMs: 30_000,
    staleSubscriptionThresholdMs: 60_000,
    replayDriftMs: 1000,
    lastRecoveryAt: null,
  }),
}));

vi.mock("@/platform/runtime/workflows/workflowRuntimeRegistry", () => ({
  workflowRuntimeRegistry: {
    listActive: () => ["billing-payment:inv-1:key-1"],
  },
}));

vi.mock("@/platform/runtime/semantics", async () => {
  const actual = await vi.importActual<typeof import("@/platform/runtime/semantics")>("@/platform/runtime/semantics");
  return {
    ...actual,
    resolveEffectiveRuntimeState: () => ({ effectiveMode: "NORMAL", version: 1 }),
  };
});

vi.mock("@/platform/observability/runtimeAnalytics", () => ({
  subscribePlatformMetrics: () => () => {},
  emitPlatformMetric: vi.fn(),
}));

vi.mock("@/services/runtime/runtimeTransitionLog.repository", () => ({
  listRecentRuntimeTransitionLogRows: vi.fn(async () => [{
    id: "row-1",
    transition_id: "tx-1",
    runtime_epoch: 7,
    transition_type: "tenant_switch",
    tenant_id: "00000000-0000-0000-0000-000000000111",
    actor_id: "user-1",
    started_at: "2026-05-10T10:00:00.000Z",
    completed_at: "2026-05-10T10:00:01.000Z",
    failed_at: null,
    rollback_triggered: false,
    trace_id: "req-1",
    runtime_transition_trace_id: "rtx-1",
    status: "completed",
    created_at: "2026-05-10T10:00:00.000Z",
  }]),
}));

vi.mock("@/services/runtime/runtimeIncidentLedger.repository", () => ({
  listRecentRuntimeIncidents: vi.fn(async () => [{
    id: "incident-1",
    tenant_id: "00000000-0000-0000-0000-000000000111",
    actor_id: "user-1",
    incident_type: "realtime_partition",
    runtime_health: "CONTAINED",
    runtime_mode: "RECOVERY",
    severity: "critical",
    trace_ids: { trace_id: "trace-recovery-1" },
    metadata: { trust_level: "CONTAINED" },
    detected_at: "2026-05-10T10:00:00.000Z",
    created_at: "2026-05-10T10:00:00.000Z",
  }]),
  listRecentRuntimeRecoveryActions: vi.fn(async () => [{
    id: "action-1",
    incident_id: "incident-1",
    tenant_id: tenantId,
    actor_id: "user-1",
    recovery_class: "rebuild",
    action_status: "completed",
    triggered_by: "automatic",
    trace_ids: { trace_id: "trace-recovery-1" },
    action_metadata: { failure: "realtime_partition" },
    started_at: "2026-05-10T10:00:00.000Z",
    completed_at: "2026-05-10T10:00:00.000Z",
    created_at: "2026-05-10T10:00:00.000Z",
  }]),
}));

vi.mock("@/services/billing/billingReconciliation", () => ({
  billingReconciliationService: {
    getOpsSnapshot: vi.fn(async () => ({
      latestRun: {
        id: "00000000-0000-0000-0000-000000000901",
        tenant_id: tenantId,
        window_start: "2026-05-01T00:00:00.000Z",
        window_end: "2026-05-10T00:00:00.000Z",
        checked_invoice_count: 3,
        checked_payment_count: 2,
        finding_count: 1,
        critical_count: 1,
        warning_count: 0,
        status: "completed",
        request_trace_id: null,
        operation_trace_id: null,
        workflow_trace_id: null,
        started_at: "2026-05-10T10:00:00.000Z",
        completed_at: "2026-05-10T10:00:00.000Z",
        created_at: "2026-05-10T10:00:00.000Z",
      },
      openFindings: [{
        id: "00000000-0000-0000-0000-000000000902",
        run_id: "00000000-0000-0000-0000-000000000901",
        tenant_id: tenantId,
        invoice_id: "00000000-0000-0000-0000-000000000444",
        payment_id: null,
        idempotency_id: null,
        finding_code: "INVOICE_PAYMENT_TOTAL_MISMATCH",
        severity: "critical",
        status: "OPEN",
        evidence: { delta: 10 },
        request_trace_id: "req-1",
        operation_trace_id: "op-1",
        workflow_trace_id: "wf-1",
        detected_at: "2026-05-10T10:00:00.000Z",
        resolved_at: null,
      }],
    })),
    runDry: vi.fn(),
    runLive: vi.fn(),
    updateFindingStatus: vi.fn(),
    exportFindingBundle: vi.fn(() => new Blob(["{}"], { type: "application/json" })),
  },
}));

vi.mock("@/services/events/eventOutbox.repository", () => ({
  eventOutboxRepository: {
    getSummary: vi.fn(async () => ({
      backlog_count: 2,
      processing_count: 1,
      retry_count: 1,
      failed_count: 0,
      delivered_count: 9,
      dead_letter_count: 1,
      oldest_undelivered_at: "2026-05-10T09:45:00.000Z",
      oldest_undelivered_age_seconds: 900,
      avg_delivery_latency_ms: 42,
    })),
    listRecent: vi.fn(async () => [{
      id: "00000000-0000-0000-0000-000000000777",
      tenant_id: tenantId,
      tenant_name: "Tenant One",
      event_type: "InvoicePaid",
      aggregate_type: "invoice",
      aggregate_id: "00000000-0000-0000-0000-000000000444",
      handler_name: "audit",
      delivery_guarantee: "exactly_once_persistence",
      status: "DEAD_LETTER",
      attempts: 7,
      max_attempts: 7,
      next_retry_at: "2026-05-10T09:45:00.000Z",
      processed_at: null,
      last_error: "audit failed",
      request_trace_id: "req-1",
      operation_trace_id: "op-1",
      workflow_trace_id: "wf-1",
      created_at: "2026-05-10T09:45:00.000Z",
      updated_at: "2026-05-10T10:00:00.000Z",
    }]),
    replay: vi.fn(async () => []),
  },
}));

vi.mock("@/services/notifications/notification.repository", () => ({
  notificationRepository: {
    listRecentDeliveryAuditEvidence: vi.fn(async () => []),
  },
}));

vi.mock("@/services/patients/patientReconciliation.repository", () => ({
  patientReconciliationRepository: {
    run: vi.fn(async () => ({ run_id: null, finding_count: 0, critical_count: 0, warning_count: 0 })),
  },
}));

vi.mock("@/services/notifications/notificationReconciliation.repository", () => ({
  notificationReconciliationRepository: {
    run: vi.fn(async () => ({ run_id: null, finding_count: 0, critical_count: 0, warning_count: 0 })),
  },
}));

vi.mock("@/services/appointments/appointmentReconciliation.repository", () => ({
  appointmentReconciliationRepository: {
    run: vi.fn(async () => ({ run_id: null, finding_count: 0, critical_count: 0, warning_count: 0 })),
  },
}));

import { RuntimeOpsPage } from "./RuntimeOpsPage";

describe("RuntimeOpsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:runtime-ops-forensic"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("renders reconciliation findings and runtime command-center panels", async () => {
    render(
      <MemoryRouter>
        <RuntimeOpsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Runtime operations")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("INVOICE_PAYMENT_TOTAL_MISMATCH").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Billing reconciliation")).toBeInTheDocument();
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("Trigger live reconciliation")).toBeInTheDocument();
    expect(screen.getByText("Export finding bundle")).toBeInTheDocument();
    expect(screen.getByText("Investigate")).toBeInTheDocument();
    expect(screen.getByText("Resolve")).toBeInTheDocument();
    expect(screen.getByText("False positive")).toBeInTheDocument();
    expect(screen.getByText("Mutation freeze")).toBeInTheDocument();
    expect(screen.getByText("Recovery timeline")).toBeInTheDocument();
    expect(screen.getAllByText(/realtime_partition/).length).toBeGreaterThan(0);
    expect(screen.getByText("Incident ledger")).toBeInTheDocument();
    expect(screen.getAllByText(/rebuild/).length).toBeGreaterThan(0);
    expect(screen.getByText("Runtime mode history")).toBeInTheDocument();
    expect(screen.getByText(/billing-payment:inv-1:key-1/)).toBeInTheDocument();
    expect(screen.getAllByText(/rtx-1/).length).toBeGreaterThan(0);
    expect(screen.getByText("Durable event delivery")).toBeInTheDocument();
    expect(screen.getByText("Incident timeline")).toBeInTheDocument();
    expect(screen.getByText("Grouped incident sessions")).toBeInTheDocument();
    expect(screen.getByText("Evidence drill-down")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation trends")).toBeInTheDocument();
    expect(screen.getByText("Open critical: 1")).toBeInTheDocument();
    expect(screen.getByText(/Repeated finding codes:/)).toBeInTheDocument();
    expect(screen.getByText("Show related transitions")).toBeInTheDocument();
    expect(screen.getByText("Show affected workflows")).toBeInTheDocument();
    expect(screen.getByText("Show reconciliation lineage")).toBeInTheDocument();
    expect(screen.getByText("Show delivery attempts")).toBeInTheDocument();
    expect(screen.getByText("Export forensic bundle")).toBeInTheDocument();
    expect(screen.getAllByText(/Primary cause:/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Billing finding").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Runtime transition").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Event outbox").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Event outbox").length).toBeGreaterThan(0);
    expect(screen.getByText("InvoicePaid")).toBeInTheDocument();
    expect(screen.getByText("exactly_once_persistence")).toBeInTheDocument();
    expect(screen.getByText("Replay")).toBeInTheDocument();
  });

  it("exports the selected forensic evidence bundle", async () => {
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName === "a") {
        Object.defineProperty(element, "click", {
          configurable: true,
          value: click,
        });
      }
      return element;
    });

    render(
      <MemoryRouter>
        <RuntimeOpsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Export forensic bundle")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Export forensic bundle"));

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
  });

  it("sends every reconciliation finding lifecycle action through the service", async () => {
    const { billingReconciliationService } = await import("@/services/billing/billingReconciliation");

    render(
      <MemoryRouter>
        <RuntimeOpsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("INVOICE_PAYMENT_TOTAL_MISMATCH").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByText("Acknowledge"));
    await waitFor(() => {
      expect(billingReconciliationService.updateFindingStatus).toHaveBeenCalledWith(
        "00000000-0000-0000-0000-000000000902",
        "ACKNOWLEDGED",
      );
    });

    fireEvent.click(screen.getByText("Investigate"));
    await waitFor(() => {
      expect(billingReconciliationService.updateFindingStatus).toHaveBeenCalledWith(
        "00000000-0000-0000-0000-000000000902",
        "INVESTIGATING",
      );
    });

    fireEvent.click(screen.getByText("Resolve"));
    await waitFor(() => {
      expect(billingReconciliationService.updateFindingStatus).toHaveBeenCalledWith(
        "00000000-0000-0000-0000-000000000902",
        "RESOLVED",
      );
    });

    fireEvent.click(screen.getByText("False positive"));
    await waitFor(() => {
      expect(billingReconciliationService.updateFindingStatus).toHaveBeenCalledWith(
        "00000000-0000-0000-0000-000000000902",
        "FALSE_POSITIVE",
      );
    });
  });
});
