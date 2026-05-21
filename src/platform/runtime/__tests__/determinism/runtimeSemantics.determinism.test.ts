import * as runtimeAnalytics from "@/platform/observability/runtimeAnalytics";
import { describe, expect, it, vi } from "vitest";
import { resolveRecoveryPolicy } from "@/platform/runtime/policy/resolveRecoveryPolicy";
import { RUNTIME_SEMANTIC_REGISTRY } from "@/platform/runtime/semantics/runtimeSemanticRegistry";
import type { RecoveryFailureKind, RuntimeFailureKind } from "@/platform/runtime/semantics/runtimeSemanticTypes";
import { resolveSemanticAction } from "@/platform/runtime/semantics/resolveSemanticAction";

describe("runtime semantics determinism", () => {
  it("covers every RuntimeFailureKind in the semantic registry", () => {
    const kinds: RuntimeFailureKind[] = [
      "stale_epoch",
      "tenant_mismatch",
      "policy_denied",
      "runtime_mode_block",
      "realtime_drift",
      "realtime_partition",
      "workflow_divergence",
      "barrier_timeout",
      "coordination_partition",
      "recovery_required",
      "readonly_transition",
      "auth_invalidation",
      "barrier_stall",
      "transition_incomplete",
      "workflow_mismatch",
      "mutation_freeze_violation",
      "duplicate_committed_command",
    ];
    for (const k of kinds) {
      expect(RUNTIME_SEMANTIC_REGISTRY[k].length).toBeGreaterThan(0);
    }
  });

  it("is idempotent: repeated resolution yields identical snapshots", () => {
    const a = resolveSemanticAction("stale_epoch");
    const b = resolveSemanticAction("stale_epoch");
    expect(a).toEqual(b);
    expect(resolveSemanticAction("coordination_partition")).toEqual(resolveSemanticAction("coordination_partition"));
  });

  it("keeps recovery policy aligned with historical RecoveryFailureKind strategies", () => {
    const expected: Record<RecoveryFailureKind, ReturnType<typeof resolveRecoveryPolicy>["strategy"]> = {
      stale_epoch: "abort",
      realtime_drift: "reconcile",
      realtime_partition: "containment",
      workflow_mismatch: "compensate",
      workflow_divergence: "compensate",
      readonly_transition: "checkpoint_pause",
      tenant_mismatch: "teardown",
      auth_invalidation: "containment",
      barrier_stall: "safe_mode",
      transition_incomplete: "reconcile",
      mutation_freeze_violation: "containment",
      duplicate_committed_command: "containment",
    };
    const emit = vi.spyOn(runtimeAnalytics, "emitPlatformMetric");
    for (const kind of Object.keys(expected) as RecoveryFailureKind[]) {
      expect(resolveRecoveryPolicy(kind).strategy).toBe(expected[kind]);
      expect(resolveSemanticAction(kind).recoveryStrategy).toBe(expected[kind]);
      expect(resolveSemanticAction(kind).failureKind).toEqual(expect.any(String));
      expect(resolveSemanticAction(kind).runtimeEffect).toEqual(expect.any(String));
      expect(resolveSemanticAction(kind).recoveryContract).toMatchObject({
        automatic: expect.any(Boolean),
        retryable: expect.any(Boolean),
        replaySafe: expect.any(Boolean),
        requiresReconciliation: expect.any(Boolean),
        requiresOperator: expect.any(Boolean),
      });
      expect(resolveSemanticAction(kind).operatorVisibility).toEqual(expect.any(String));
      expect(resolveSemanticAction(kind).replaySafety).toEqual(expect.any(String));
    }
    emit.mockRestore();
  });

  it("resolves first-class recovery classes for operator trust decisions", () => {
    expect(resolveRecoveryPolicy("stale_epoch")).toMatchObject({
      recoveryClass: "abort",
      orderedClasses: ["abort", "invalidate", "reconcile"],
      automatic: true,
      requiresOperator: false,
    });
    expect(resolveRecoveryPolicy("workflow_divergence").recoveryClass).toBe("reconcile");
    expect(resolveRecoveryPolicy("realtime_partition").orderedClasses).toEqual(["rebuild", "invalidate", "reconcile"]);
    expect(resolveRecoveryPolicy("mutation_freeze_violation").recoveryClass).toBe("contain");
    expect(resolveRecoveryPolicy("duplicate_committed_command")).toMatchObject({
      recoveryClass: "manual_operator_action",
      automatic: false,
      requiresOperator: true,
    });
  });
});
