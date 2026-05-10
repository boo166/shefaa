import { describe, expect, it, beforeEach, vi } from "vitest";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";
import { runtimeHealthStore } from "../runtimeHealthStore";
import { recoveryOrchestrator } from "../recoveryOrchestrator";
import { persistRuntimeIncidentLedger } from "@/services/runtime/runtimeIncidentLedger.repository";

vi.mock("@/services/runtime/runtimeIncidentLedger.repository", () => ({
  persistRuntimeIncidentLedger: vi.fn(async () => undefined),
}));

describe("recoveryOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recoveryOrchestrator.clearForTests();
    workflowRuntimeRegistry.clearAll();
    runtimeMutationGate.unfreezeWrites();
    runtimeHealthStore.setHealth("HEALTHY");
  });

  it("deterministically aborts stale-epoch workflows and records audit trail", () => {
    workflowRuntimeRegistry.register("billing-payment:old-epoch");

    const entries = recoveryOrchestrator.recover({
      failure: "stale_epoch",
      tenantId: "tenant-1",
      actorId: "actor-1",
      reason: "stale epoch test",
      traceId: "trace-1",
    });

    expect(entries.map((entry) => entry.action)).toEqual(["started", "applied", "applied", "applied"]);
    expect(entries.map((entry) => entry.recoveryClass)).toEqual(["abort", "abort", "invalidate", "reconcile"]);
    expect(workflowRuntimeRegistry.listActive()).toEqual([]);
    expect(recoveryOrchestrator.getAuditTrail()[0]).toMatchObject({
      failure: "stale_epoch",
      traceId: "trace-1",
    });
    expect(recoveryOrchestrator.getTrustLevel()).toBe("DEGRADED");
    expect(persistRuntimeIncidentLedger).toHaveBeenCalledWith(expect.objectContaining({
      incident: expect.objectContaining({
        incident_type: "stale_epoch",
        trace_ids: { trace_id: "trace-1" },
        metadata: expect.objectContaining({
          reason_code: "runtime_recovery",
          workflow_count: 1,
        }),
      }),
      actions: expect.arrayContaining([
        expect.objectContaining({ recovery_class: "abort", action_status: "completed" }),
      ]),
    }));
  });

  it("contains mutation-freeze violations without pretending they are healthy", () => {
    recoveryOrchestrator.recover({
      failure: "mutation_freeze_violation",
      reason: "write attempted during freeze",
    });

    expect(runtimeMutationGate.isWritesFrozen()).toBe(true);
    expect(runtimeHealthStore.getSnapshot()).toBe("CONTAINED");
    expect(recoveryOrchestrator.getTrustLevel()).toBe("CONTAINED");
  });

  it("requires manual operator action for duplicate committed commands", () => {
    const entries = recoveryOrchestrator.recover({
      failure: "duplicate_committed_command",
      tenantId: "tenant-1",
      reason: "duplicate idempotency replay",
    });

    expect(entries.at(-1)).toMatchObject({
      action: "operator_required",
      recoveryClass: "manual_operator_action",
      requiresOperator: true,
      trustLevel: "UNTRUSTED",
    });
    expect(runtimeHealthStore.getSnapshot()).toBe("FAILED_SAFE");
  });
});
