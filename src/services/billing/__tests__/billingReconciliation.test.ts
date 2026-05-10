import { describe, expect, it, vi, beforeEach } from "vitest";
import { subscribePlatformMetrics } from "@/platform/observability/runtimeAnalytics";

const tenantId = "00000000-0000-0000-0000-000000000111";

vi.mock("@/core/auth/authStore", () => ({
  useAuth: {
    getState: () => ({
      user: { id: "user-1", tenantId, globalRoles: [], tenantRoles: ["clinic_admin"], tenantStatus: "active" },
      tenantOverride: null,
    }),
  },
  selectEffectiveTenantId: () => tenantId,
}));

vi.mock("@/platform/data/platformRepository", () => ({
  platformRepository: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { platformRepository } from "@/platform/data/platformRepository";
import { billingReconciliationRepository } from "../billingReconciliation.repository";
import {
  billingReconciliationService,
  emitBillingReconciliationTick,
  scoreBillingReconciliationHealth,
} from "../billingReconciliation";

describe("billing reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the DB-owned reconciliation RPC through platformRepository", async () => {
    vi.mocked(platformRepository.rpc).mockResolvedValue({
      data: [{
        run_id: null,
        tenant_id: tenantId,
        checked_invoice_count: 2,
        checked_payment_count: 1,
        finding_count: 0,
        critical_count: 0,
        warning_count: 0,
        dry_run: true,
        completed_at: "2026-05-10T10:00:00.000Z",
      }],
      error: null,
    } as never);

    const result = await billingReconciliationRepository.run({
      tenantId,
      windowStart: "2026-05-01T00:00:00.000Z",
      windowEnd: "2026-05-10T00:00:00.000Z",
      dryRun: true,
    });

    expect(result.finding_count).toBe(0);
    expect(platformRepository.rpc).toHaveBeenCalledWith(
      "run_billing_reconciliation",
      expect.objectContaining({
        _tenant_id: tenantId,
        _dry_run: true,
      }),
      expect.objectContaining({
        action: "billing.reconciliation.run",
        classification: "readonly",
        tenantScoped: true,
        tenantId,
      }),
    );
  });

  it("emits reconciliation metrics without PHI-shaped fields", async () => {
    const received: Array<[string, Record<string, unknown>]> = [];
    const unsubscribe = subscribePlatformMetrics((name, payload) => {
      received.push([name, payload]);
    });
    vi.mocked(platformRepository.rpc).mockResolvedValue({
      data: [{
        run_id: null,
        tenant_id: tenantId,
        checked_invoice_count: 1,
        checked_payment_count: 1,
        finding_count: 1,
        critical_count: 1,
        warning_count: 0,
        dry_run: true,
        completed_at: "2026-05-10T10:00:00.000Z",
      }],
      error: null,
    } as never);

    await billingReconciliationService.runDry({
      windowStart: "2026-05-01T00:00:00.000Z",
      windowEnd: "2026-05-10T00:00:00.000Z",
    });
    unsubscribe();

    const completed = received.find(([name]) => name === "billing.reconciliation_run.completed");
    expect(completed?.[1]).toMatchObject({
      tenantId,
      dryRun: true,
      findingCount: 1,
      criticalCount: 1,
    });
    expect(JSON.stringify(received)).not.toContain("patient");
    expect(JSON.stringify(received)).not.toContain("full_name");
  });

  it("keeps reconciliation ticks traceable without evidence payloads", () => {
    const received: Array<[string, Record<string, unknown>]> = [];
    const unsubscribe = subscribePlatformMetrics((name, payload) => {
      received.push([name, payload]);
    });

    emitBillingReconciliationTick({
      tenantId,
      invoiceId: "00000000-0000-0000-0000-000000000444",
      resultCode: "OK",
      idempotencyReplay: false,
      requestTraceId: "req-1",
      operationTraceId: "op-1",
      workflowTraceId: "wf-1",
      latestFindingCount: 0,
      latestCriticalCount: 0,
    });
    unsubscribe();

    expect(received).toContainEqual([
      "billing.reconciliation_tick",
      expect.objectContaining({
        tenantId,
        invoiceId: "00000000-0000-0000-0000-000000000444",
        requestTraceId: "req-1",
        operationTraceId: "op-1",
        workflowTraceId: "wf-1",
      }),
    ]);
    expect(JSON.stringify(received)).not.toContain("evidence");
  });

  it("scores runtime health from reconciliation severity and failures", () => {
    expect(scoreBillingReconciliationHealth({ openFindings: [] })).toBe("HEALTHY");
    expect(scoreBillingReconciliationHealth({
      openFindings: [{ severity: "critical" } as never],
    })).toBe("DEGRADED");
    expect(scoreBillingReconciliationHealth({
      openFindings: [{ severity: "critical" } as never, { severity: "critical" } as never],
    })).toBe("CONTAINED");
    expect(scoreBillingReconciliationHealth({
      latestRun: { status: "failed" } as never,
      openFindings: [],
    })).toBe("RECOVERING");
  });
});
