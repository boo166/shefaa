import { useAuth } from "@/core/auth/authStore";
import { reconcileAll } from "@/platform/realtime/realtimeRuntime";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { runtimeHealthStore } from "@/platform/runtime/recovery/runtimeHealthStore";
import { queryClient } from "@/services/query/queryClient.instance";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";
import { coordinationDiagnostics } from "./coordinationDiagnostics";
import { consistencyBarrier } from "./consistencyBarrier";
import { emitCoordinationMetric } from "./coordinationTelemetry";
import { runtimeEpochManager } from "./runtimeEpochManager";

export type RuntimeSnapshot = {
  capturedAt: string;
  epoch: number;
  sessionVersion: string | null;
  authMachineState: string;
  tenantId: string | null;
  effectiveTenantId: string | null;
  runtimeMode: string;
  runtimeModeVersion: number;
  runtimeHealth: string;
  activeWorkflows: number;
  lastTransitionId: string | null;
  barriers: {
    tenant_transition: number;
    auth_recovery: number;
    readonly_enter: number;
  };
};

export function createRuntimeSnapshot(): RuntimeSnapshot {
  const auth = useAuth.getState();
  const mode = runtimeModeController.getSnapshot();
  const diag = coordinationDiagnostics.getSnapshot();
  return {
    capturedAt: new Date().toISOString(),
    epoch: runtimeEpochManager.getCurrentEpoch(),
    sessionVersion: auth.sessionVersion,
    authMachineState: auth.authMachineState,
    tenantId: auth.user?.tenantId ?? null,
    effectiveTenantId: auth.tenantOverride?.id ?? auth.user?.tenantId ?? null,
    runtimeMode: mode.effective.effectiveMode,
    runtimeModeVersion: mode.effective.version,
    runtimeHealth: runtimeHealthStore.getSnapshot(),
    activeWorkflows: workflowRuntimeRegistry.listActive().length,
    lastTransitionId: diag.lastTransitionId,
    barriers: {
      tenant_transition: consistencyBarrier.getDepth("tenant_transition"),
      auth_recovery: consistencyBarrier.getDepth("auth_recovery"),
      readonly_enter: consistencyBarrier.getDepth("readonly_enter"),
    },
  };
}

/**
 * Restores coordination understanding only (no sockets/closures): epoch adoption, mode refresh, query invalidation, realtime reconcile.
 */
export async function restoreRuntimeSnapshot(snapshot: RuntimeSnapshot): Promise<void> {
  runtimeEpochManager.adoptIfNewer(snapshot.epoch, "manual");
  await runtimeModeController.refresh();
  await queryClient.invalidateQueries();
  reconcileAll({ force: true });
  emitCoordinationMetric("coordination.snapshot.restored", {
    epoch: snapshot.epoch,
    runtimeModeVersion: snapshot.runtimeModeVersion,
  });
}
