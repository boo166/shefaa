import { consistencyBarrier } from "@/platform/runtime/coordination/consistencyBarrier";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { RuntimeMode } from "@/platform/runtime/policy/runtimePolicy";
import { resolveRuntimePolicy } from "@/platform/runtime/policy/resolveRuntimePolicy";
import { runtimeHealthStore } from "@/platform/runtime/recovery/runtimeHealthStore";
import { useAuth } from "@/core/auth/authStore";
import type { EffectiveRuntimeState } from "./runtimeSemanticTypes";

/**
 * Unified operational snapshot: intent (mode) + observation (health) + derived gates.
 * Subsystems should prefer this over re-deriving combinations locally.
 */
export function resolveEffectiveRuntimeState(): EffectiveRuntimeState {
  const snap = runtimeModeController.getSnapshot().effective;
  const health = runtimeHealthStore.getSnapshot();
  const writesFrozen = runtimeMutationGate.isWritesFrozen();
  const tenantBarrierDepth = consistencyBarrier.getDepth("tenant_transition");

  const auth = useAuth.getState();
  const policy = resolveRuntimePolicy({
    operation: "semantics.effective_snapshot",
    operationClass: "readonly",
    assuranceLevel: auth.privilegedAuth?.currentLevel ?? null,
    runtimeState: snap,
    tenantStatus: auth.user?.tenantStatus ?? null,
  });

  const writesAllowed = policy.writeAllowed && !writesFrozen;
  const workflowsAllowed =
    snap.effectiveMode !== RuntimeMode.READONLY
    && snap.effectiveMode !== RuntimeMode.SAFE_MODE
    && snap.effectiveMode !== RuntimeMode.INCIDENT
    && health !== "FAILED_SAFE"
    && !writesFrozen;

  let realtimePosture: EffectiveRuntimeState["realtimePosture"] = "NORMAL";
  if (
    snap.effectiveMode === RuntimeMode.READONLY
    || snap.effectiveMode === RuntimeMode.SAFE_MODE
    || snap.effectiveMode === RuntimeMode.INCIDENT
  ) {
    realtimePosture = "READONLY";
  }
  if (health === "PARTITIONED" || health === "FAILED_SAFE") {
    realtimePosture = "PAUSED";
  }

  let uiSeverity: EffectiveRuntimeState["uiSeverity"] = "none";
  if (health === "DEGRADED" || health === "RECOVERING") uiSeverity = "warning";
  if (health === "PARTITIONED" || health === "FAILED_SAFE" || snap.effectiveMode === RuntimeMode.INCIDENT) {
    uiSeverity = "critical";
  }
  if (tenantBarrierDepth > 0 || writesFrozen) uiSeverity = uiSeverity === "none" ? "warning" : uiSeverity;

  return {
    mode: snap.effectiveMode,
    modeVersion: snap.version,
    health,
    writesFrozen,
    tenantBarrierDepth,
    writesAllowed,
    workflowsAllowed,
    realtimePosture,
    uiSeverity,
  };
}
