import { resolveSemanticAction } from "@/platform/runtime/semantics/resolveSemanticAction";
import { recoveryClassesForFailure } from "@/platform/runtime/semantics/runtimeSemanticRegistry";
import type {
  RecoveryClass,
  RecoveryFailureKind,
  RecoveryPolicyResolution,
  RecoveryStrategy,
} from "@/platform/runtime/semantics/runtimeSemanticTypes";

export type {
  RecoveryClass,
  RecoveryFailureKind,
  RecoveryPolicyResolution,
  RecoveryStrategy,
} from "@/platform/runtime/semantics/runtimeSemanticTypes";

const MANUAL_CLASSES: ReadonlySet<RecoveryClass> = new Set(["manual_operator_action"]);

/** Delegates to {@link resolveSemanticAction} — single source of truth for recovery mapping. */
export function resolveRecoveryPolicy(kind: RecoveryFailureKind): RecoveryPolicyResolution {
  const orderedClasses = recoveryClassesForFailure(kind);
  const requiresOperator = orderedClasses.some((klass) => MANUAL_CLASSES.has(klass));
  return {
    strategy: resolveSemanticAction(kind).recoveryStrategy,
    recoveryClass: orderedClasses[0] ?? "reconcile",
    orderedClasses,
    automatic: !requiresOperator,
    requiresOperator,
  };
}
