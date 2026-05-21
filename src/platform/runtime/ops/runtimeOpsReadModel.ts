import { subscribePlatformMetrics } from "@/platform/observability/runtimeAnalytics";
import { getRealtimeRegistryDiagnostics } from "@/platform/realtime/realtimeRuntime";
import { consistencyBarrier } from "@/platform/runtime/coordination/consistencyBarrier";
import { coordinationDiagnostics } from "@/platform/runtime/coordination/coordinationDiagnostics";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import type { RuntimeMode } from "@/platform/runtime/policy";
import { recoveryOrchestrator } from "@/platform/runtime/recovery/recoveryOrchestrator";
import { runtimeHealthStore } from "@/platform/runtime/recovery/runtimeHealthStore";
import { resolveEffectiveRuntimeState } from "@/platform/runtime/semantics";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";

let lastBillingTick: Record<string, string | number | boolean | undefined> | null = null;

export function subscribeBillingRuntimeTick(onChange: () => void) {
  return subscribePlatformMetrics((name, payload) => {
    if (name === "billing.reconciliation_tick") {
      lastBillingTick = { ...payload };
      onChange();
    }
  });
}

export function getBillingRuntimeTick() {
  return lastBillingTick;
}

export type RuntimeTopologySnapshot = {
  mode: RuntimeMode;
  epoch: number;
  tenantBarrierDepth: number;
  health: ReturnType<typeof runtimeHealthStore.getSnapshot>;
  activeTransitionKind: string | null;
  lastRejectionReason: string | null;
};

let lastRuntimeTopologySnapshot: RuntimeTopologySnapshot | null = null;

export function subscribeRuntimeTopology(onChange: () => void) {
  const u1 = runtimeModeController.subscribe(() => onChange());
  const u2 = runtimeEpochManager.subscribe(() => onChange());
  const u3 = coordinationDiagnostics.subscribe(() => onChange());
  const u4 = runtimeHealthStore.subscribe(() => onChange());
  return () => {
    u1();
    u2();
    u3();
    u4();
  };
}

export function getRuntimeTopologySnapshot() {
  const diag = coordinationDiagnostics.getSnapshot();
  const next: RuntimeTopologySnapshot = {
    mode: runtimeModeController.getSnapshot().effective.effectiveMode,
    epoch: runtimeEpochManager.getCurrentEpoch(),
    tenantBarrierDepth: consistencyBarrier.getDepth("tenant_transition"),
    health: runtimeHealthStore.getSnapshot(),
    activeTransitionKind: diag.activeTransitionKind,
    lastRejectionReason: diag.lastRejection?.reason ?? null,
  };

  if (
    lastRuntimeTopologySnapshot
    && lastRuntimeTopologySnapshot.mode === next.mode
    && lastRuntimeTopologySnapshot.epoch === next.epoch
    && lastRuntimeTopologySnapshot.tenantBarrierDepth === next.tenantBarrierDepth
    && lastRuntimeTopologySnapshot.health === next.health
    && lastRuntimeTopologySnapshot.activeTransitionKind === next.activeTransitionKind
    && lastRuntimeTopologySnapshot.lastRejectionReason === next.lastRejectionReason
  ) {
    return lastRuntimeTopologySnapshot;
  }

  lastRuntimeTopologySnapshot = next;
  return next;
}

export function buildRuntimeOpsSnapshot() {
  return {
    effective: resolveEffectiveRuntimeState(),
    epoch: runtimeEpochManager.getCurrentEpoch(),
    diag: coordinationDiagnostics.getSnapshot(),
    health: runtimeHealthStore.getSnapshot(),
    barriers: {
      tenant: consistencyBarrier.getDepth("tenant_transition"),
      auth: consistencyBarrier.getDepth("auth_recovery"),
      readonly: consistencyBarrier.getDepth("readonly_enter"),
    },
    mutationFreeze: {
      frozen: runtimeMutationGate.isWritesFrozen(),
      reason: runtimeMutationGate.getFreezeReason(),
    },
    realtime: typeof window !== "undefined"
      ? getRealtimeRegistryDiagnostics()
      : {
        intentCount: 0,
        activeChannelCount: 0,
        churnThrottledRecently: false,
        connectionState: "CONNECTED" as const,
        maxReplayDriftMs: 30_000,
        staleSubscriptionThresholdMs: 60_000,
        replayDriftMs: 0,
        lastRecoveryAt: null,
      },
    workflows: workflowRuntimeRegistry.listActive(),
    billingTick: getBillingRuntimeTick(),
    recovery: {
      trustLevel: recoveryOrchestrator.getTrustLevel(),
      timeline: recoveryOrchestrator.getAuditTrail().slice(0, 8),
    },
  };
}

export const serverRuntimeOpsSnapshot = {
  effective: resolveEffectiveRuntimeState(),
  epoch: runtimeEpochManager.getCurrentEpoch(),
  diag: coordinationDiagnostics.getSnapshot(),
  health: runtimeHealthStore.getSnapshot(),
  barriers: { tenant: 0, auth: 0, readonly: 0 },
  mutationFreeze: { frozen: false, reason: null },
  realtime: {
    intentCount: 0,
    activeChannelCount: 0,
    churnThrottledRecently: false,
    connectionState: "CONNECTED" as const,
    maxReplayDriftMs: 30_000,
    staleSubscriptionThresholdMs: 60_000,
    replayDriftMs: 0,
    lastRecoveryAt: null,
  },
  workflows: [] as string[],
  billingTick: null,
  recovery: { trustLevel: "HEALTHY" as const, timeline: [] },
};

let cachedRuntimeOpsSnapshot: ReturnType<typeof buildRuntimeOpsSnapshot> | null = null;
let runtimeOpsSnapshotDirty = true;

export function getRuntimeOpsSnapshot() {
  if (!cachedRuntimeOpsSnapshot || runtimeOpsSnapshotDirty) {
    cachedRuntimeOpsSnapshot = buildRuntimeOpsSnapshot();
    runtimeOpsSnapshotDirty = false;
  }
  return cachedRuntimeOpsSnapshot;
}

function notifyRuntimeOpsSnapshotChanged(cb: () => void) {
  runtimeOpsSnapshotDirty = true;
  cb();
}

export function subscribeRuntimeOps(onChange: () => void) {
  const notify = () => notifyRuntimeOpsSnapshotChanged(onChange);
  const u1 = runtimeModeController.subscribe(notify);
  const u2 = runtimeEpochManager.subscribe(notify);
  const u3 = coordinationDiagnostics.subscribe(notify);
  const u4 = runtimeHealthStore.subscribe(notify);
  const u5 = subscribeBillingRuntimeTick(notify);
  const u6 = recoveryOrchestrator.subscribe(notify);
  return () => {
    u1();
    u2();
    u3();
    u4();
    u5();
    u6();
  };
}

export function subscribeRuntimeEpoch(onChange: () => void) {
  return runtimeEpochManager.subscribe(() => onChange());
}

export function getRuntimeEpoch() {
  return runtimeEpochManager.getCurrentEpoch();
}
