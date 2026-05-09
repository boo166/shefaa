import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { deriveRecoveryStrategy, RUNTIME_SEMANTIC_REGISTRY, semanticSeverity } from "./runtimeSemanticRegistry";
import type { RuntimeFailureKind, SemanticResolution } from "./runtimeSemanticTypes";

/**
 * Canonical interpretation: one resolver for failure → actions + legacy recovery + telemetry.
 * New runtime behavior should consult this instead of ad hoc switches in subsystems.
 */
export function resolveSemanticAction(kind: RuntimeFailureKind): SemanticResolution {
  const actions = RUNTIME_SEMANTIC_REGISTRY[kind];
  const recoveryStrategy = deriveRecoveryStrategy(actions);
  const uiSeverity = semanticSeverity(kind);

  emitPlatformMetric("runtime.semantic_action", {
    failureKind: kind,
    recoveryStrategy,
    uiSeverity,
    actions: actions.join(","),
  });

  return {
    kind,
    actions,
    recoveryStrategy,
    uiSeverity,
  };
}
