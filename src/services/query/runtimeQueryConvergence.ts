import type { QueryClient } from "@tanstack/react-query";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";

const RT_SCOPE = "rt";

/** Segment marker at index 1 in tenant-scoped query keys (see {@link queryKeys}). */
export const RUNTIME_QUERY_SCOPE_MARKER = RT_SCOPE;

let uninstall: (() => void) | null = null;

function isEpochScopedKey(queryKey: readonly unknown[]): boolean {
  return Array.isArray(queryKey) && queryKey[1] === RT_SCOPE && typeof queryKey[2] === "number";
}

/** Drop cache entries whose `rt` epoch segment is strictly less than `epoch`. */
export function removeStaleRuntimeQueryScopes(queryClient: QueryClient, epoch: number) {
  queryClient.removeQueries({
    predicate: (q) => {
      const k = q.queryKey as readonly unknown[];
      return isEpochScopedKey(k) && (k[2] as number) < epoch;
    },
  });
  emitPlatformMetric("query.runtime_epoch_scope_removed", { epoch });
}

/**
 * Drop cache entries tied to a **prior** runtime epoch so stale hydration cannot resume after
 * causality advances (tenant switch, auth boundary, mode, etc.).
 */
export function installRuntimeQueryConvergence(queryClient: QueryClient) {
  if (typeof window === "undefined") return;
  if (uninstall) return;

  let debounce: ReturnType<typeof setTimeout> | null = null;

  const unsub = runtimeEpochManager.subscribe(({ epoch }) => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      removeStaleRuntimeQueryScopes(queryClient, epoch);
    }, 32);
  });

  uninstall = () => {
    unsub();
    if (debounce) clearTimeout(debounce);
    uninstall = null;
  };
}
