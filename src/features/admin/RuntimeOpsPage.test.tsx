import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";

const tenantId = "00000000-0000-0000-0000-000000000111";

vi.mock("@/core/auth/authStore", () => ({
  useAuth: () => ({
    user: { id: "user-1", tenantId, globalRoles: ["super_admin"], tenantRoles: [] },
    tenantOverride: { id: tenantId, slug: "tenant-one", name: "Tenant One" },
  }),
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

vi.mock("@/platform/realtime/realtimeRuntime", () => ({
  getRealtimeRegistryDiagnostics: () => ({
    intentCount: 2,
    activeChannelCount: 1,
    churnThrottledRecently: false,
  }),
}));

vi.mock("@/platform/runtime/workflows/workflowRuntimeRegistry", () => ({
  workflowRuntimeRegistry: {
    listActive: () => ["billing-payment:inv-1:key-1"],
  },
}));

vi.mock("@/platform/runtime/semantics", () => ({
  resolveEffectiveRuntimeState: () => ({ effectiveMode: "NORMAL", version: 1 }),
}));

vi.mock("@/platform/observability/runtimeAnalytics", () => ({
  subscribePlatformMetrics: () => () => {},
}));

vi.mock("@/services/runtime/runtimeTransitionLog.repository", () => ({
  listRecentRuntimeTransitionLogRows: vi.fn(async () => [{
    id: "row-1",
    transition_id: "tx-1",
    runtime_epoch: 7,
    transition_type: "tenant_switch",
    tenant_id: tenantId,
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
        status: "open",
        evidence: { delta: 10 },
        request_trace_id: "req-1",
        operation_trace_id: "op-1",
        workflow_trace_id: "wf-1",
        detected_at: "2026-05-10T10:00:00.000Z",
        resolved_at: null,
      }],
    })),
    runDry: vi.fn(),
  },
}));

import { RuntimeOpsPage } from "./RuntimeOpsPage";

describe("RuntimeOpsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders reconciliation findings and runtime command-center panels", async () => {
    render(
      <MemoryRouter>
        <RuntimeOpsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Runtime operations")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("INVOICE_PAYMENT_TOTAL_MISMATCH")).toBeInTheDocument();
    });
    expect(screen.getByText("Billing reconciliation")).toBeInTheDocument();
    expect(screen.getByText("Mutation freeze")).toBeInTheDocument();
    expect(screen.getByText("Runtime mode history")).toBeInTheDocument();
    expect(screen.getByText(/billing-payment:inv-1:key-1/)).toBeInTheDocument();
    expect(screen.getByText(/rtx-1/)).toBeInTheDocument();
  });
});
