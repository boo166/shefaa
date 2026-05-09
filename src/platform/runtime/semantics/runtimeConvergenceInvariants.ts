import { consistencyBarrier } from "@/platform/runtime/coordination/consistencyBarrier";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";

const strict = () => Boolean((import.meta as ImportMeta)?.env?.DEV);

function emitViolation(name: string, detail?: Record<string, string | number | undefined>) {
  emitPlatformMetric("runtime.invariant_violation", { name, ...detail });
  if (strict()) {
    throw new Error(`runtime invariant violated: ${name}`);
  }
}

/** Best-effort: active workflows should not outlive epoch bumps without re-validation (caller supplies expected epoch). */
export function assertWorkflowEpochAligned(expectedEpoch: number) {
  const active = workflowRuntimeRegistry.listActive();
  if (active.length === 0) return;
  const current = runtimeEpochManager.getCurrentEpoch();
  if (current !== expectedEpoch) {
    emitViolation("workflow_epoch_drift", { active: active.length, expectedEpoch, current });
  }
}

export function assertNoMutationDuringFreeze(context: string) {
  if (runtimeMutationGate.isWritesFrozen()) {
    emitViolation("mutation_during_freeze", { context });
  }
}

export function assertBarrierDepthNonNegative(name: string) {
  const d = consistencyBarrier.getDepth(name);
  if (d < 0) emitViolation("barrier_depth_negative", { name, d });
}
