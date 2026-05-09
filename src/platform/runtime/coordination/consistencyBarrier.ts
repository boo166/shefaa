import { emitCoordinationMetric } from "./coordinationTelemetry";

type BarrierState = {
  /** Number of holders blocking release (transitions in flight). */
  depth: number;
  waiters: Array<{ resolve: () => void; reject: (e: Error) => void }>;
};

const barriers = new Map<string, BarrierState>();

function getOrCreate(name: string): BarrierState {
  let s = barriers.get(name);
  if (!s) {
    s = { depth: 0, waiters: [] };
    barriers.set(name, s);
  }
  return s;
}

export const consistencyBarrier = {
  /** Block waiters until all holders call leave. */
  enter(name: string) {
    const s = getOrCreate(name);
    s.depth += 1;
    emitCoordinationMetric("coordination.barrier_wait", { name, phase: "enter", depth: s.depth });
  },

  leave(name: string) {
    const s = barriers.get(name);
    if (!s || s.depth <= 0) return;
    s.depth -= 1;
    emitCoordinationMetric("coordination.barrier_cleared", { name, phase: "leave", depth: s.depth });
    if (s.depth === 0) {
      const waiters = s.waiters.splice(0, s.waiters.length);
      for (const w of waiters) w.resolve();
    }
  },

  /** Alias for {@link waitUntilClear} — wait until the named barrier has no active holders. */
  wait(name: string, timeoutMs = 30_000): Promise<void> {
    return this.waitUntilClear(name, timeoutMs);
  },

  /**
   * Wait until no transition holds the barrier (depth 0).
   */
  waitUntilClear(name: string, timeoutMs = 30_000): Promise<void> {
    const s = getOrCreate(name);
    if (s.depth === 0) return Promise.resolve();
    emitCoordinationMetric("coordination.barrier_wait", { name, phase: "wait", depth: s.depth });
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        emitCoordinationMetric("coordination.barrier.timeout", { name });
        reject(new Error(`consistencyBarrier.waitUntilClear timeout: ${name}`));
      }, timeoutMs);
      s.waiters.push({
        resolve: () => {
          clearTimeout(t);
          resolve();
        },
        reject: (e) => {
          clearTimeout(t);
          reject(e);
        },
      });
    });
  },

  /** Test / diagnostics */
  getDepth(name: string): number {
    return barriers.get(name)?.depth ?? 0;
  },
};
