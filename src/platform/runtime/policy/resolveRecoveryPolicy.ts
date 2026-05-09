import { resolveSemanticAction } from "@/platform/runtime/semantics/resolveSemanticAction";
import type {
  RecoveryFailureKind,
  RecoveryPolicyResolution,
  RecoveryStrategy,
} from "@/platform/runtime/semantics/runtimeSemanticTypes";

export type { RecoveryFailureKind, RecoveryPolicyResolution, RecoveryStrategy } from "@/platform/runtime/semantics/runtimeSemanticTypes";

/** Delegates to {@link resolveSemanticAction} — single source of truth for recovery mapping. */
export function resolveRecoveryPolicy(kind: RecoveryFailureKind): RecoveryPolicyResolution {
  return { strategy: resolveSemanticAction(kind).recoveryStrategy };
}
