import { useSyncExternalStore } from "react";
import { platform } from "@/platform/sdk";

/** Current runtime epoch for explicit query key lineage (optional; {@link RuntimeEpochQueryBridge} already remounts keys). */
export function useRuntimeQueryEpoch(): number {
  return useSyncExternalStore(
    platform.coordination.readModels.subscribeEpoch,
    platform.coordination.readModels.getEpoch,
    platform.coordination.readModels.getEpoch,
  );
}
