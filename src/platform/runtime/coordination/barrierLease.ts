import { getCoordinationTabId } from "./coordinationTabId";
import { emitCoordinationMetric } from "./coordinationTelemetry";

const PREFIX = "shefaa-coord-barrier:";

export type BarrierLeaseRecord = {
  holderTabId: string;
  transitionId: string;
  acquiredAt: number;
};

function key(barrierName: string) {
  return `${PREFIX}${barrierName}`;
}

function read(barrierName: string): BarrierLeaseRecord | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key(barrierName));
    if (!raw) return null;
    return JSON.parse(raw) as BarrierLeaseRecord;
  } catch {
    return null;
  }
}

function write(barrierName: string, rec: BarrierLeaseRecord) {
  sessionStorage.setItem(key(barrierName), JSON.stringify(rec));
}

function clear(barrierName: string) {
  sessionStorage.removeItem(key(barrierName));
}

/**
 * Acquire lease for this tab. If another tab holds a lease from the last 2 minutes, throws.
 */
export function acquireBarrierLease(barrierName: string, transitionId: string) {
  const me = getCoordinationTabId();
  const existing = read(barrierName);
  const staleMs = 120_000;
  if (existing && existing.holderTabId !== me && Date.now() - existing.acquiredAt < staleMs) {
    emitCoordinationMetric("coordination.barrier.lease_denied", {
      barrier: barrierName,
      holderTabId: existing.holderTabId,
    });
    throw new Error(`barrier lease held by another tab: ${barrierName}`);
  }
  write(barrierName, { holderTabId: me, transitionId, acquiredAt: Date.now() });
  emitCoordinationMetric("coordination.barrier.lease_acquired", { barrier: barrierName });
}

export function releaseBarrierLease(barrierName: string, transitionId: string) {
  const existing = read(barrierName);
  const me = getCoordinationTabId();
  if (!existing || existing.holderTabId !== me || existing.transitionId !== transitionId) {
    emitCoordinationMetric("coordination.barrier.lease_release_skipped", { barrier: barrierName });
    return;
  }
  clear(barrierName);
  emitCoordinationMetric("coordination.barrier.lease_released", { barrier: barrierName });
}

export function getBarrierLease(barrierName: string): BarrierLeaseRecord | null {
  return read(barrierName);
}
