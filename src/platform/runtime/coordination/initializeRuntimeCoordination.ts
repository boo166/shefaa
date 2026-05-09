import { queryClient } from "@/services/query/queryClient.instance";
import { installRuntimeQueryConvergence } from "@/services/query/runtimeQueryConvergence";
import { transitionRecoveryManager } from "@/platform/runtime/recovery/transitionRecoveryManager";
import { runtimeEpochManager } from "./runtimeEpochManager";

/**
 * Call once at app bootstrap (after auth store module is loadable).
 * Enables cross-tab epoch convergence via BroadcastChannel.
 */
export function initializeRuntimeCoordination() {
  if (typeof window === "undefined") return;
  runtimeEpochManager.initCrossTabSync();
  installRuntimeQueryConvergence(queryClient);
  transitionRecoveryManager.bootstrap();
}
