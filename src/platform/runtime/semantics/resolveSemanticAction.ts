import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import {
  canonicalFailureKind,
  deriveRecoveryStrategy,
  operatorVisibility,
  replaySafety,
  recoveryContractForFailure,
  RUNTIME_SEMANTIC_REGISTRY,
  runtimeEffectForActions,
  semanticSeverity,
} from "./runtimeSemanticRegistry";
import type { RuntimeFailureKind, SemanticResolution } from "./runtimeSemanticTypes";

/**
 * Canonical interpretation: one resolver for failure → actions + legacy recovery + telemetry.
 * New runtime behavior should consult this instead of ad hoc switches in subsystems.
 */
export function resolveSemanticAction(kind: RuntimeFailureKind): SemanticResolution {
  const actions = RUNTIME_SEMANTIC_REGISTRY[kind];
  const recoveryStrategy = deriveRecoveryStrategy(actions);
  const uiSeverity = semanticSeverity(kind);
  const failureKind = canonicalFailureKind(kind);
  const runtimeEffect = runtimeEffectForActions(actions);
  const recoveryContract = recoveryContractForFailure(kind);
  const visibility = operatorVisibility(kind);
  const safety = replaySafety(kind);

  emitPlatformMetric("runtime.semantic_action", {
    failureKind: kind,
    canonicalFailureKind: failureKind,
    runtimeEffect,
    recoveryStrategy,
    operatorVisibility: visibility,
    replaySafety: safety,
    uiSeverity,
    actions: actions.join(","),
  });

  return {
    kind,
    failureKind,
    runtimeEffect,
    actions,
    recoveryStrategy,
    recoveryContract,
    operatorVisibility: visibility,
    replaySafety: safety,
    requiresReconciliation: recoveryContract.requiresReconciliation,
    containmentBehavior: recoveryContract.containmentBehavior,
    uiSeverity,
  };
}
