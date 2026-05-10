import { useSyncExternalStore } from "react";
import { useAuth } from "@/core/auth/authStore";
import { cn } from "@/lib/utils";
import { coordinationDiagnostics } from "@/platform/runtime/coordination/coordinationDiagnostics";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { consistencyBarrier } from "@/platform/runtime/coordination/consistencyBarrier";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { RuntimeMode } from "@/platform/runtime/policy";
import { runtimeHealthStore } from "@/platform/runtime/recovery/runtimeHealthStore";

function subscribeRuntimeTopology(onChange: () => void) {
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

type RuntimeTopologySnapshot = {
  mode: RuntimeMode;
  epoch: number;
  tenantBarrierDepth: number;
  health: ReturnType<typeof runtimeHealthStore.getSnapshot>;
  activeTransitionKind: string | null;
  lastRejectionReason: string | null;
};

let lastRuntimeTopologySnapshot: RuntimeTopologySnapshot | null = null;

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

/**
 * Global operational strip: auth machine state and runtime topology (mode vs health).
 */
export function RuntimeStatusLayer({ className }: { className?: string }) {
  const authMachineState = useAuth((s) => s.authMachineState);
  const isLoading = useAuth((s) => s.isLoading);
  const topology = useSyncExternalStore(
    subscribeRuntimeTopology,
    getRuntimeTopologySnapshot,
    getRuntimeTopologySnapshot,
  );

  if (authMachineState === "authenticated" && !isLoading) {
    const showGovernance =
      topology.mode !== RuntimeMode.NORMAL ||
      topology.tenantBarrierDepth > 0 ||
      topology.health !== "HEALTHY" ||
      topology.activeTransitionKind != null;
    if (!showGovernance) return null;
    return (
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "sticky top-0 z-50 flex w-full flex-wrap items-center justify-center gap-x-3 border-b border-border bg-muted/90 px-3 py-1 text-center text-xs font-medium text-muted-foreground",
          className,
        )}
        data-testid="runtime-governance-strip"
      >
        <span>Mode: {topology.mode}</span>
        <span className="opacity-80">Health: {topology.health}</span>
        <span className="opacity-70">epoch {topology.epoch}</span>
        {topology.tenantBarrierDepth > 0 ? (
          <span className="text-amber-700 dark:text-amber-300">tenant barrier…</span>
        ) : null}
        {topology.activeTransitionKind ? (
          <span className="text-amber-800 dark:text-amber-200">
            Transition: {topology.activeTransitionKind}
          </span>
        ) : null}
        {topology.lastRejectionReason ? (
          <span className="text-xs opacity-60">last reject: {topology.lastRejectionReason}</span>
        ) : null}
      </div>
    );
  }

  const message =
    authMachineState === "refreshing"
      ? "Reconnecting session…"
      : authMachineState === "reauth_required"
        ? "Additional verification required — some actions are restricted."
        : authMachineState === "mfa_required" || authMachineState === "mfa_verifying"
          ? "Multi-factor authentication in progress…"
          : authMachineState === "authenticating"
            ? "Signing in…"
            : authMachineState === "error"
              ? "Session error — retry or sign in again."
              : authMachineState === "initializing" || isLoading
                ? "Loading session…"
                : `Session: ${authMachineState.replace(/_/g, " ")}`;

  const variant =
    authMachineState === "reauth_required"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100"
      : "border-border bg-muted/80 text-muted-foreground";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "sticky top-0 z-50 flex w-full items-center justify-center border-b px-3 py-1.5 text-center text-xs font-medium",
        variant,
        className,
      )}
      data-testid="runtime-status-layer"
    >
      {message}
    </div>
  );
}
