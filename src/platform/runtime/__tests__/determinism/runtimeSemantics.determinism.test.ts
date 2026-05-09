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
      "workflow_divergence",
      "barrier_timeout",
      "coordination_partition",
      "recovery_required",
      "readonly_transition",
      "auth_invalidation",
      "barrier_stall",
      "transition_incomplete",
      "workflow_mismatch",
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
      workflow_mismatch: "compensate",
      readonly_transition: "checkpoint_pause",
      tenant_mismatch: "teardown",
      auth_invalidation: "containment",
      barrier_stall: "safe_mode",
      transition_incomplete: "reconcile",
    };
    const emit = vi.spyOn(runtimeAnalytics, "emitPlatformMetric");
    for (const kind of Object.keys(expected) as RecoveryFailureKind[]) {
      expect(resolveRecoveryPolicy(kind).strategy).toBe(expected[kind]);
      expect(resolveSemanticAction(kind).recoveryStrategy).toBe(expected[kind]);
    }
    emit.mockRestore();
  });
});
