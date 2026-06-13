import { beforeEach, describe, expect, it, vi } from "vitest";
import { withLatency } from "../../../../tests/chaos/injectors/latency";
import { recoveryOrchestrator } from "@/platform/runtime/recovery/recoveryOrchestrator";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";

vi.mock("@/services/runtime/runtimeIncidentLedger.repository", () => ({
  persistRuntimeIncidentLedger: vi.fn(async () => undefined),
}));

describe("chaos injectors (operational scenarios)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recoveryOrchestrator.clearForTests();
    workflowRuntimeRegistry.clearAll();
  });

  it("withLatency delays execution", async () => {
    const order: string[] = [];
    await withLatency(15, async () => {
      order.push("inner");
    });
    order.push("after");
    expect(order).toEqual(["inner", "after"]);
  });

  it("scenario 7: payment replay under latency requires operator verification on duplicate commit", async () => {
    const phases: string[] = [];
    await withLatency(10, async () => {
      phases.push("payment_command_committed");
    });
    await withLatency(5, async () => {
      phases.push("idempotent_replay");
    });

    workflowRuntimeRegistry.register("billing-payment:chaos-replay");
    const entries = recoveryOrchestrator.recover({
      failure: "duplicate_committed_command",
      tenantId: "50000000-0000-0000-0000-000000000001",
      reason: "payment replay chaos drill",
      traceId: "wf-chaos-payment-replay",
    });

    expect(phases).toEqual(["payment_command_committed", "idempotent_replay"]);
    expect(entries.at(-1)?.action).toBe("operator_required");
  });

  it("scenario 8: tenant switch during payment aborts stale epoch workflows", async () => {
    workflowRuntimeRegistry.register("billing-payment:chaos-tenant-switch");

    const entries = recoveryOrchestrator.recover({
      failure: "stale_epoch",
      tenantId: "50000000-0000-0000-0000-000000000001",
      reason: "tenant switch during active payment",
      traceId: "wf-chaos-tenant-switch",
    });

    expect(entries.map((entry) => entry.recoveryClass)).toContain("abort");
    expect(workflowRuntimeRegistry.listActive()).toEqual([]);
  });
});
