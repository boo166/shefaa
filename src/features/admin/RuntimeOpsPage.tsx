import { useSyncExternalStore } from "react";
import { consistencyBarrier } from "@/platform/runtime/coordination/consistencyBarrier";
import { coordinationDiagnostics } from "@/platform/runtime/coordination/coordinationDiagnostics";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { runtimeHealthStore } from "@/platform/runtime/recovery/runtimeHealthStore";
import { getRealtimeRegistryDiagnostics } from "@/platform/realtime/realtimeRuntime";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";
import { resolveEffectiveRuntimeState } from "@/platform/runtime/semantics";
import { subscribePlatformMetrics } from "@/platform/observability/runtimeAnalytics";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const OPS_FLAG = import.meta.env.VITE_RUNTIME_OPS_CONSOLE === "1" || import.meta.env.DEV;

let lastBillingTick: Record<string, string | number | boolean | undefined> | null = null;

function subscribeBillingTick(onChange: () => void) {
  return subscribePlatformMetrics((name, payload) => {
    if (name === "billing.reconciliation_tick") {
      lastBillingTick = { ...payload };
      onChange();
    }
  });
}

function getBillingTick() {
  return lastBillingTick;
}

function useOpsStore() {
  return useSyncExternalStore(
    (cb) => {
      const u1 = runtimeModeController.subscribe(() => cb());
      const u2 = runtimeEpochManager.subscribe(() => cb());
      const u3 = coordinationDiagnostics.subscribe(() => cb());
      const u4 = runtimeHealthStore.subscribe(() => cb());
      const u5 = subscribeBillingTick(() => cb());
      return () => {
        u1();
        u2();
        u3();
        u4();
        u5();
      };
    },
    () => ({
      effective: resolveEffectiveRuntimeState(),
      epoch: runtimeEpochManager.getCurrentEpoch(),
      diag: coordinationDiagnostics.getSnapshot(),
      health: runtimeHealthStore.getSnapshot(),
      barriers: {
        tenant: consistencyBarrier.getDepth("tenant_transition"),
        auth: consistencyBarrier.getDepth("auth_recovery"),
        readonly: consistencyBarrier.getDepth("readonly_enter"),
      },
      realtime: typeof window !== "undefined" ? getRealtimeRegistryDiagnostics() : { intentCount: 0, activeChannelCount: 0, churnThrottledRecently: false },
      workflows: workflowRuntimeRegistry.listActive(),
      billingTick: getBillingTick(),
    }),
    () => ({
      effective: resolveEffectiveRuntimeState(),
      epoch: runtimeEpochManager.getCurrentEpoch(),
      diag: coordinationDiagnostics.getSnapshot(),
      health: runtimeHealthStore.getSnapshot(),
      barriers: { tenant: 0, auth: 0, readonly: 0 },
      realtime: { intentCount: 0, activeChannelCount: 0, churnThrottledRecently: false },
      workflows: [],
      billingTick: null,
    }),
  );
}

/**
 * Operator-only runtime governance (super-admin route). Read-only panels; no direct kernel mutation.
 */
export function RuntimeOpsPage() {
  const snap = useOpsStore();

  if (!OPS_FLAG) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center text-sm text-muted-foreground">
        <p>Runtime ops console is disabled.</p>
        <p className="mt-2">Set <code className="rounded bg-muted px-1">VITE_RUNTIME_OPS_CONSOLE=1</code> to enable outside development.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/admin">Back to admin</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Runtime operations</h1>
          <p className="text-sm text-muted-foreground">Read-only topology for incident response (not clinic UI).</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin">Admin home</Link>
        </Button>
      </div>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-medium">Effective runtime state</h2>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
          {JSON.stringify(snap.effective, null, 2)}
        </pre>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-2 font-medium">Coordination</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Epoch: {snap.epoch}</li>
            <li>Health: {snap.health}</li>
            <li>Active transition: {snap.diag.activeTransitionKind ?? "—"}</li>
            <li>Last rejection: {snap.diag.lastRejection?.reason ?? "—"}</li>
            <li>Barrier tenant: {snap.barriers.tenant}</li>
            <li>Barrier auth_recovery: {snap.barriers.auth}</li>
            <li>Barrier readonly_enter: {snap.barriers.readonly}</li>
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-2 font-medium">Realtime registry</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Intents: {snap.realtime.intentCount}</li>
            <li>Active channels: {snap.realtime.activeChannelCount}</li>
            <li>Churn warn: {snap.realtime.churnThrottledRecently ? "yes" : "no"}</li>
          </ul>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-medium">Active workflows</h2>
        {snap.workflows.length === 0 ? (
          <p className="text-xs text-muted-foreground">None</p>
        ) : (
          <ul className="list-inside list-disc text-xs text-muted-foreground">
            {snap.workflows.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-medium">Last billing reconciliation tick</h2>
        <p className="text-xs text-muted-foreground">
          Emitted on successful payment workflow completion (<code>billing.reconciliation_tick</code>).
        </p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
          {snap.billingTick ? JSON.stringify(snap.billingTick, null, 2) : "—"}
        </pre>
      </section>
    </div>
  );
}
