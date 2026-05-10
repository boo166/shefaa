import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { selectEffectiveTenantId, useAuth } from "@/core/auth/authStore";
import type {
  BillingReconciliationFinding,
  BillingReconciliationRun,
  BillingReconciliationSummary,
} from "@/domain/billing/billing.types";
import { consistencyBarrier } from "@/platform/runtime/coordination/consistencyBarrier";
import { coordinationDiagnostics } from "@/platform/runtime/coordination/coordinationDiagnostics";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { runtimeMutationGate } from "@/platform/runtime/coordination/runtimeMutationGate";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { recoveryOrchestrator } from "@/platform/runtime/recovery/recoveryOrchestrator";
import { runtimeHealthStore } from "@/platform/runtime/recovery/runtimeHealthStore";
import { getRealtimeRegistryDiagnostics } from "@/platform/realtime/realtimeRuntime";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";
import { resolveEffectiveRuntimeState } from "@/platform/runtime/semantics";
import { subscribePlatformMetrics } from "@/platform/observability/runtimeAnalytics";
import { billingReconciliationService } from "@/services/billing/billingReconciliation";
import {
  listRecentRuntimeTransitionLogRows,
  type RuntimeTransitionLogRow,
} from "@/services/runtime/runtimeTransitionLog.repository";
import {
  listRecentRuntimeIncidents,
  listRecentRuntimeRecoveryActions,
  type RuntimeIncidentTimelineRow,
  type RuntimeRecoveryActionRow,
} from "@/services/runtime/runtimeIncidentLedger.repository";

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

function buildClientOpsSnapshot() {
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
    billingTick: getBillingTick(),
    recovery: {
      trustLevel: recoveryOrchestrator.getTrustLevel(),
      timeline: recoveryOrchestrator.getAuditTrail().slice(0, 8),
    },
  };
}

const serverOpsSnapshot = {
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

let cachedOpsSnapshot = buildClientOpsSnapshot();
let cachedOpsSnapshotKey = JSON.stringify(cachedOpsSnapshot);

function getClientOpsSnapshot() {
  const next = buildClientOpsSnapshot();
  const key = JSON.stringify(next);
  if (key !== cachedOpsSnapshotKey) {
    cachedOpsSnapshot = next;
    cachedOpsSnapshotKey = key;
  }
  return cachedOpsSnapshot;
}

function useOpsStore() {
  return useSyncExternalStore(
    (cb) => {
      const u1 = runtimeModeController.subscribe(() => cb());
      const u2 = runtimeEpochManager.subscribe(() => cb());
      const u3 = coordinationDiagnostics.subscribe(() => cb());
      const u4 = runtimeHealthStore.subscribe(() => cb());
      const u5 = subscribeBillingTick(() => cb());
      const u6 = recoveryOrchestrator.subscribe(() => cb());
      return () => {
        u1();
        u2();
        u3();
        u4();
        u5();
        u6();
      };
    },
    getClientOpsSnapshot,
    () => serverOpsSnapshot,
  );
}

export function RuntimeOpsPage() {
  const snap = useOpsStore();
  const auth = useAuth();
  const effectiveTenantId = selectEffectiveTenantId(auth);
  const [latestRun, setLatestRun] = useState<BillingReconciliationRun | null>(null);
  const [openFindings, setOpenFindings] = useState<BillingReconciliationFinding[]>([]);
  const [dryRunSummary, setDryRunSummary] = useState<BillingReconciliationSummary | null>(null);
  const [transitionRows, setTransitionRows] = useState<RuntimeTransitionLogRow[]>([]);
  const [incidentRows, setIncidentRows] = useState<RuntimeIncidentTimelineRow[]>([]);
  const [recoveryActionRows, setRecoveryActionRows] = useState<RuntimeRecoveryActionRow[]>([]);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [loadingOps, setLoadingOps] = useState(false);
  const [runningDry, setRunningDry] = useState(false);
  const [runningLive, setRunningLive] = useState(false);
  const [actionFindingId, setActionFindingId] = useState<string | null>(null);

  const refreshOps = useCallback(async () => {
    if (!effectiveTenantId) {
      setLatestRun(null);
      setOpenFindings([]);
      setTransitionRows([]);
      setIncidentRows([]);
      setRecoveryActionRows([]);
      return;
    }
    setLoadingOps(true);
    setOpsError(null);
    try {
      const [reconciliation, transitions, incidents, recoveryActions] = await Promise.all([
        billingReconciliationService.getOpsSnapshot(),
        listRecentRuntimeTransitionLogRows(6),
        listRecentRuntimeIncidents(6),
        listRecentRuntimeRecoveryActions(8),
      ]);
      setLatestRun(reconciliation.latestRun);
      setOpenFindings(reconciliation.openFindings);
      setTransitionRows(transitions);
      setIncidentRows(incidents);
      setRecoveryActionRows(recoveryActions);
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : "Failed to load operations snapshot");
    } finally {
      setLoadingOps(false);
    }
  }, [effectiveTenantId]);

  useEffect(() => {
    void refreshOps();
  }, [refreshOps]);

  const runDryReconciliation = async () => {
    setRunningDry(true);
    setOpsError(null);
    try {
      setDryRunSummary(await billingReconciliationService.runDry());
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : "Failed to run billing reconciliation");
    } finally {
      setRunningDry(false);
    }
  };

  const runLiveReconciliation = async () => {
    setRunningLive(true);
    setOpsError(null);
    try {
      await billingReconciliationService.runLive();
      await refreshOps();
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : "Failed to run live billing reconciliation");
    } finally {
      setRunningLive(false);
    }
  };

  const markFindingAcknowledged = async (findingId: string) => {
    setActionFindingId(findingId);
    setOpsError(null);
    try {
      await billingReconciliationService.updateFindingStatus(findingId, "ACKNOWLEDGED");
      await refreshOps();
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : "Failed to acknowledge finding");
    } finally {
      setActionFindingId(null);
    }
  };

  const exportFindingBundle = () => {
    const blob = billingReconciliationService.exportFindingBundle({ latestRun, openFindings });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `billing-reconciliation-${effectiveTenantId ?? "tenant"}-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Runtime operations</h1>
          <p className="text-sm text-muted-foreground">Read-only topology for incident response and billing reconciliation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => void refreshOps()} variant="outline" size="sm" disabled={loadingOps || !effectiveTenantId}>
            Refresh
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">Admin home</Link>
          </Button>
        </div>
      </div>

      {opsError ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {opsError}
        </section>
      ) : null}

      {!effectiveTenantId ? (
        <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Select a tenant access context before loading tenant-scoped billing operations.
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-2 font-medium">Runtime stability</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Health: {snap.health}</li>
            <li>Trust: {snap.recovery.trustLevel}</li>
            <li>Epoch: {snap.epoch}</li>
            <li>Mode: {snap.effective.effectiveMode}</li>
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-2 font-medium">Mutation freeze</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Frozen: {snap.mutationFreeze.frozen ? "yes" : "no"}</li>
            <li>Reason: {snap.mutationFreeze.reason ?? "-"}</li>
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-2 font-medium">Billing drift</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Open findings: {openFindings.length}</li>
            <li>Critical: {openFindings.filter((finding) => finding.severity === "critical").length}</li>
            <li>Last run: {latestRun?.completed_at ? new Date(latestRun.completed_at).toLocaleString() : "-"}</li>
          </ul>
        </div>
      </section>

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
            <li>Active transition: {snap.diag.activeTransitionKind ?? "-"}</li>
            <li>Last rejection: {snap.diag.lastRejection?.reason ?? "-"}</li>
            <li>Barrier tenant: {snap.barriers.tenant}</li>
            <li>Barrier auth_recovery: {snap.barriers.auth}</li>
            <li>Barrier readonly_enter: {snap.barriers.readonly}</li>
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm">
          <h2 className="mb-2 font-medium">Realtime registry</h2>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>State: {snap.realtime.connectionState}</li>
            <li>Intents: {snap.realtime.intentCount}</li>
            <li>Active channels: {snap.realtime.activeChannelCount}</li>
            <li>Replay drift: {Math.round(snap.realtime.replayDriftMs / 1000)}s</li>
            <li>Churn warn: {snap.realtime.churnThrottledRecently ? "yes" : "no"}</li>
          </ul>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-medium">Recovery timeline</h2>
        {snap.recovery.timeline.length === 0 ? (
          <p className="text-xs text-muted-foreground">No recovery actions recorded in this session.</p>
        ) : (
          <ul className="space-y-2 text-xs text-muted-foreground">
            {snap.recovery.timeline.map((entry) => (
              <li key={`${entry.id}:${entry.action}:${entry.occurredAt}`} className="rounded border p-2">
                <span className="font-medium text-foreground">{entry.failure}</span>
                {" "}{entry.action} via {entry.recoveryClass} at {new Date(entry.occurredAt).toLocaleString()}
                <span className="block">Trust: {entry.trustLevel}; Health: {entry.runtimeHealth}</span>
                {entry.traceId ? <span className="block break-all">Trace: {entry.traceId}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-medium">Incident ledger</h2>
        {incidentRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No persisted runtime incidents visible for this operator.</p>
        ) : (
          <ul className="space-y-2 text-xs text-muted-foreground">
            {incidentRows.map((row) => (
              <li key={row.id} className="rounded border p-2">
                <span className="font-medium text-foreground">{row.incident_type}</span>
                {" "}{row.severity} at {new Date(row.detected_at).toLocaleString()}
                <span className="block">Health: {row.runtime_health}; Mode: {row.runtime_mode}</span>
              </li>
            ))}
          </ul>
        )}
        {recoveryActionRows.length > 0 ? (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Recovery actions</h3>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {recoveryActionRows.map((row) => (
                <li key={row.id} className="rounded border p-2">
                  <span className="font-medium text-foreground">{row.recovery_class}</span>
                  {" "}{row.action_status} by {row.triggered_by} at {new Date(row.started_at).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Billing reconciliation</h2>
            <p className="mt-1 text-xs text-muted-foreground">Latest persisted run and safe dry-run validator.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void runDryReconciliation()} disabled={runningDry || !effectiveTenantId}>
            {runningDry ? "Running" : "Run dry reconciliation"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void runLiveReconciliation()} disabled={runningLive || !effectiveTenantId}>
            {runningLive ? "Running" : "Trigger live reconciliation"}
          </Button>
          <Button size="sm" variant="outline" onClick={exportFindingBundle} disabled={!effectiveTenantId || (!latestRun && openFindings.length === 0)}>
            Export finding bundle
          </Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded border p-3">
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Latest run</h3>
            {latestRun ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>Run: {latestRun.id}</li>
                <li>Completed: {new Date(latestRun.completed_at).toLocaleString()}</li>
                <li>Invoices: {latestRun.checked_invoice_count}</li>
                <li>Payments: {latestRun.checked_payment_count}</li>
                <li>Findings: {latestRun.finding_count} ({latestRun.critical_count} critical)</li>
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No persisted run found.</p>
            )}
          </div>
          <div className="rounded border p-3">
            <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Dry-run result</h3>
            {dryRunSummary ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                <li>Completed: {new Date(dryRunSummary.completed_at).toLocaleString()}</li>
                <li>Invoices: {dryRunSummary.checked_invoice_count}</li>
                <li>Payments: {dryRunSummary.checked_payment_count}</li>
                <li>Findings: {dryRunSummary.finding_count} ({dryRunSummary.critical_count} critical)</li>
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No dry run in this session.</p>
            )}
          </div>
        </div>
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Open findings</h3>
          {openFindings.length === 0 ? (
            <p className="text-xs text-muted-foreground">None</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Severity</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Invoice</th>
                    <th className="py-2 pr-3 font-medium">Payment</th>
                    <th className="py-2 pr-3 font-medium">State</th>
                    <th className="py-2 pr-3 font-medium">Trace</th>
                    <th className="py-2 pr-3 font-medium">Detected</th>
                    <th className="py-2 pr-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {openFindings.map((finding) => (
                    <tr key={finding.id} className="border-t">
                      <td className="py-2 pr-3">{finding.severity}</td>
                      <td className="py-2 pr-3 font-medium">{finding.finding_code}</td>
                      <td className="py-2 pr-3">{finding.invoice_id ?? "-"}</td>
                      <td className="py-2 pr-3">{finding.payment_id ?? "-"}</td>
                      <td className="py-2 pr-3">{finding.status}</td>
                      <td className="py-2 pr-3">{finding.workflow_trace_id ?? finding.operation_trace_id ?? finding.request_trace_id ?? "-"}</td>
                      <td className="py-2 pr-3">{new Date(finding.detected_at).toLocaleString()}</td>
                      <td className="py-2 pr-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void markFindingAcknowledged(finding.id)}
                          disabled={actionFindingId === finding.id || finding.status === "ACKNOWLEDGED"}
                        >
                          Acknowledge
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-medium">Runtime mode history</h2>
        {transitionRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No transition rows visible for this operator.</p>
        ) : (
          <ul className="space-y-2 text-xs text-muted-foreground">
            {transitionRows.map((row) => (
              <li key={row.id} className="rounded border p-2">
                <span className="font-medium text-foreground">{row.transition_type}</span>
                {" "}{row.status} at {new Date(row.started_at).toLocaleString()}
                {row.runtime_transition_trace_id ? (
                  <span className="block break-all">Trace: {row.runtime_transition_trace_id}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-2 font-medium">Last billing reconciliation tick</h2>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
          {snap.billingTick ? JSON.stringify(snap.billingTick, null, 2) : "-"}
        </pre>
      </section>
    </div>
  );
}
