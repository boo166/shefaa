import { useSyncExternalStore } from "react";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";

/** Current runtime epoch for explicit query key lineage (optional; {@link RuntimeEpochQueryBridge} already remounts keys). */
export function useRuntimeQueryEpoch(): number {
  return useSyncExternalStore(
    runtimeEpochManager.subscribe,
    () => runtimeEpochManager.getCurrentEpoch(),
    () => runtimeEpochManager.getCurrentEpoch(),
  );
}
