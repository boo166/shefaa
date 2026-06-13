import { describe, expect, it, beforeEach, vi } from "vitest";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";
import { runtimeHealthStore } from "../runtimeHealthStore";
import { recoveryOrchestrator } from "../recoveryOrchestrator";
import { persistRuntimeIncidentLedger } from "@/services/runtime/runtimeIncidentLedger.repository";

vi.mock("@/services/runtime/runtimeIncidentLedger.repository", () => ({
  persistRuntimeIncidentLedger: vi.fn(async () => undefined),
}));

describe("cross-domain disaster recovery orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recoveryOrchestrator.clearForTests();
    workflowRuntimeRegistry.clearAll();
    runtimeMutationGate.unfreezeWrites();
    runtimeHealthStore.setHealth("HEALTHY");
  });

  it("replays billing payment workflows after stale epoch without pretending health is restored", () => {
    workflowRuntimeRegistry.register("billing-payment:dr-epoch-1");

    const entries = recoveryOrchestrator.recover({
      failure: "stale_epoch",
      tenantId: "50000000-0000-0000-0000-000000000001",
      actorId: "51000000-0000-0000-0000-000000000001",
      reason: "billing payment replay after crash",
      traceId: "wf-dr-payment",
    });

    expect(entries.map((entry) => entry.recoveryClass)).toEqual(["abort", "abort", "invalidate", "reconcile"]);
    expect(workflowRuntimeRegistry.listActive()).toEqual([]);
    expect(recoveryOrchestrator.getTrustLevel()).toBe("DEGRADED");
    expect(persistRuntimeIncidentLedger).toHaveBeenCalledWith(expect.objectContaining({
      incident: expect.objectContaining({
        incident_type: "stale_epoch",
        trace_ids: expect.objectContaining({ trace_id: "wf-dr-payment" }),
      }),
    }));
  });

  it("requires operator action for duplicate committed billing commands", () => {
    workflowRuntimeRegistry.register("billing-payment:dr-duplicate");

    const entries = recoveryOrchestrator.recover({
      failure: "duplicate_committed_command",
      tenantId: "50000000-0000-0000-0000-000000000001",
      reason: "billing payment idempotency replay conflict",
      traceId: "wf-dr-payment-replay",
    });

    expect(entries.at(-1)).toMatchObject({
      action: "operator_required",
      recoveryClass: "manual_operator_action",
      requiresOperator: true,
      trustLevel: "UNTRUSTED",
    });
    expect(runtimeHealthStore.getSnapshot()).toBe("FAILED_SAFE");
  });

  it("contains notification delivery partition failures without clearing dead-letter evidence", () => {
    workflowRuntimeRegistry.register("notification-delivery:dr-worker");

    recoveryOrchestrator.recover({
      failure: "realtime_partition",
      tenantId: "50000000-0000-0000-0000-000000000001",
      reason: "notification outbox worker partition",
      traceId: "wf-dr-notif",
    });

    expect(recoveryOrchestrator.getTrustLevel()).toBe("CONTAINED");
    expect(runtimeHealthStore.getSnapshot()).toBe("CONTAINED");
    expect(persistRuntimeIncidentLedger).toHaveBeenCalledWith(expect.objectContaining({
      incident: expect.objectContaining({
        incident_type: "realtime_partition",
        trace_ids: expect.objectContaining({ trace_id: "wf-dr-notif" }),
      }),
    }));
  });
});
