import type { RuntimeEpochBumpReason } from "./types";
import { emitCoordinationMetric } from "./coordinationTelemetry";

let epoch = 1;
const listeners = new Set<(e: { epoch: number; reason: RuntimeEpochBumpReason }) => void>();

const BC_NAME = "shefaa-runtime-epoch";

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    return new BroadcastChannel(BC_NAME);
  } catch {
    return null;
  }
}

let bc: BroadcastChannel | null = null;
let bcListenerAttached = false;

function attachCrossTabListener() {
  if (bcListenerAttached) return;
  bc = getBroadcastChannel();
  if (!bc) return;
  bcListenerAttached = true;
  bc.onmessage = (ev: MessageEvent) => {
    const data = ev.data as { epoch?: number } | undefined;
    if (typeof data?.epoch === "number" && data.epoch > epoch) {
      epoch = data.epoch;
      emitCoordinationMetric("coordination.epoch_bumped", { source: "cross_tab", epoch });
      for (const l of listeners) l({ epoch, reason: "manual" });
    }
  };
}

function broadcastEpoch(next: number) {
  try {
    if (!bc) bc = getBroadcastChannel();
    bc?.postMessage({ epoch: next });
  } catch {
    /* ignore */
  }
}

export const runtimeEpochManager = {
  getCurrentEpoch(): number {
    return epoch;
  },

  subscribe(handler: (e: { epoch: number; reason: RuntimeEpochBumpReason }) => void) {
    listeners.add(handler);
    return () => listeners.delete(handler);
  },

  bump(reason: RuntimeEpochBumpReason, meta?: Record<string, unknown>) {
    epoch += 1;
    emitCoordinationMetric("coordination.epoch_bumped", {
      reason,
      epoch,
      ...(meta && typeof meta.tab === "string" ? { tab: meta.tab } : {}),
    });
    broadcastEpoch(epoch);
    for (const l of listeners) l({ epoch, reason });
    return epoch;
  },

  /** Adopt a remote epoch if higher (e.g. from orchestration leader). */
  adoptIfNewer(remoteEpoch: number, reason: RuntimeEpochBumpReason = "manual") {
    if (remoteEpoch <= epoch) return epoch;
    epoch = remoteEpoch;
    emitCoordinationMetric("coordination.epoch_bumped", { reason, epoch, source: "adopt" });
    for (const l of listeners) l({ epoch, reason });
    return epoch;
  },

  validateOperationEpoch(operationEpoch: number | undefined): { ok: true } | { ok: false; current: number } {
    if (operationEpoch === undefined) return { ok: true };
    if (operationEpoch === epoch) return { ok: true };
    emitCoordinationMetric("coordination.stale_epoch_rejected", {
      operationEpoch,
      currentEpoch: epoch,
    });
    return { ok: false, current: epoch };
  },

  initCrossTabSync() {
    attachCrossTabListener();
  },
};
