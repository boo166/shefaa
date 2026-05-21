import type { ReactNode } from "react";
import { useEffect, useReducer } from "react";
import { platform } from "@/platform/sdk";

/**
 * Forces a subtree re-render when the runtime epoch advances so `queryKeys` factories
 * pick up the new epoch segment (epoch-aware cache partitioning).
 */
export function RuntimeEpochQueryBridge({ children }: { children: ReactNode }) {
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => platform.coordination.readModels.subscribeEpoch(() => force()), []);

  return children;
}
