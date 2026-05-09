/**
 * Observed runtime condition — orthogonal to {@link RuntimeMode} (operational intent).
 */
export type RuntimeHealth =
  | "HEALTHY"
  | "DEGRADED"
  | "CONTAINED"
  | "RECOVERING"
  | "PARTITIONED"
  | "FAILED_SAFE";

const listeners = new Set<(h: RuntimeHealth) => void>();
let health: RuntimeHealth = "HEALTHY";

export const runtimeHealthStore = {
  getSnapshot(): RuntimeHealth {
    return health;
  },

  subscribe(fn: (h: RuntimeHealth) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  setHealth(next: RuntimeHealth) {
    if (health === next) return;
    health = next;
    for (const l of listeners) l(next);
  },
};
