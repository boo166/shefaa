import type { ReactNode } from "react";
import { useEffect, useReducer } from "react";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";

/**
 * Forces a subtree re-render when the runtime epoch advances so `queryKeys` factories
 * pick up the new epoch segment (epoch-aware cache partitioning).
 */
export function RuntimeEpochQueryBridge({ children }: { children: ReactNode }) {
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => runtimeEpochManager.subscribe(() => force()), []);

  return children;
}
