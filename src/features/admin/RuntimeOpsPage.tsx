import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { selectEffectiveTenantId, useAuth } from "@/core/auth/authStore";
import type {
  BillingReconciliationFinding,
  BillingReconciliationRun,
  BillingReconciliationSummary,
} from "@/domain/billing/billing.types";
import {
  evidenceFromDryReconciliationSummary,
  evidenceFromEventOutbox,
  evidenceFromReconciliationFinding,
  evidenceFromReconciliationRun,
  evidenceFromRecoveryAction,
  evidenceFromRuntimeIncident,
  evidenceFromRuntimeTransition,
  primaryTraceId,
  sortOperationalEvidence,
  type OperationalEvidenceEnvelope,
} from "@/platform/runtime/semantics";
import { platform } from "@/platform/sdk";
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
import {
  eventOutboxRepository,
  type EventOutboxRow,
  type EventOutboxSummary,
} from "@/services/events/eventOutbox.repository";

const OPS_FLAG = import.meta.env.VITE_RUNTIME_OPS_CONSOLE === "1" || import.meta.env.DEV;

type IncidentSession = {
  key: string;
  label: string;
  firstAt: string;
  lastAt: string;
  itemCount: number;
  traceId: string | null;
  kinds: string[];
  primaryCause: string;
};

function formatDateTime(value: string | number | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function ageLabel(from: string | null | undefined) {
  if (!from) return "-";
  const ageMs = Date.now() - new Date(from).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "-";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function buildIncidentTimeline(input: {
  latestRun: BillingReconciliationRun | null;
  dryRunSummary: BillingReconciliationSummary | null;
  openFindings: BillingReconciliationFinding[];
  transitionRows: RuntimeTransitionLogRow[];
  incidentRows: RuntimeIncidentTimelineRow[];
  recoveryActionRows: RuntimeRecoveryActionRow[];
  eventOutboxRows: EventOutboxRow[];
}): OperationalEvidenceEnvelope[] {
  return sortOperationalEvidence([
    ...(input.latestRun ? [evidenceFromReconciliationRun(input.latestRun)] : []),
    ...(input.dryRunSummary ? [evidenceFromDryReconciliationSummary(input.dryRunSummary)] : []),
    ...input.openFindings.map(evidenceFromReconciliationFinding),
    ...input.transitionRows.map(evidenceFromRuntimeTransition),
    ...input.incidentRows.map(evidenceFromRuntimeIncident),
    ...input.recoveryActionRows.map(evidenceFromRecoveryAction),
    ...input.eventOutboxRows.map(evidenceFromEventOutbox),
  ]);
}

function buildFindingCodeSummary(findings: BillingReconciliationFinding[]) {
  const counts = new Map<string, number>();
  for (const finding of findings) {
    counts.set(finding.finding_code, (counts.get(finding.finding_code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);
}

function evidenceKind(item: OperationalEvidenceEnvelope) {
  if (item.source === "billing_reconciliation_findings") return "Billing finding";
  if (item.source === "billing_reconciliation_runs") return "Reconciliation run";
  if (item.source === "billing_reconciliation_dry_run") return "Dry reconciliation";
  if (item.source === "event_outbox") return "Event outbox";
  if (item.source === "runtime_incident_timeline") return "Runtime incident";
  if (item.source === "runtime_recovery_actions") return "Recovery action";
  if (item.source === "runtime_transition_log") return "Runtime transition";
  return item.category.replace(/_/g, " ");
}

function evidencePrimaryTrace(item: OperationalEvidenceEnvelope) {
  return primaryTraceId(item.traceIds) ?? null;
}

function sessionKeyFor(item: OperationalEvidenceEnvelope) {
  return evidencePrimaryTrace(item) ?? item.traceIds.reconciliationRunId ?? item.traceIds.causalParentId ?? item.tenantId ?? "untraced";
}

function buildIncidentSessions(items: OperationalEvidenceEnvelope[]): IncidentSession[] {
  const grouped = new Map<string, OperationalEvidenceEnvelope[]>();
  for (const item of items) {
    const key = sessionKeyFor(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const ordered = group.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const traces = ordered.map(evidencePrimaryTrace).filter(Boolean);
      const traceId = traces[0] ?? null;
      const kinds = [...new Set(ordered.map(evidenceKind))];
      const primary = ordered.find((item) => item.source === "billing_reconciliation_findings")
        ?? ordered.find((item) => item.source === "runtime_incident_timeline")
        ?? ordered[0];
      return {
        key,
        label: traceId ? `Trace ${traceId}` : key === "untraced" ? "Untraced evidence" : `Session ${key}`,
        firstAt: ordered[ordered.length - 1]?.createdAt ?? "",
        lastAt: ordered[0]?.createdAt ?? "",
        itemCount: ordered.length,
        traceId,
        kinds,
        primaryCause: `${evidenceKind(primary)}: ${primary.detail ?? primary.failureKind}`,
      };
    })
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
    .slice(0, 8);
}

function matchesEvidenceSession(item: OperationalEvidenceEnvelope, selectedSessionKey: string | null) {
  if (!selectedSessionKey) return false;
  return sessionKeyFor(item) === selectedSessionKey;
}

function buildForensicBundle(input: {
  tenantId: string | null;
  selectedSession: IncidentSession | null;
  evidenceItems: OperationalEvidenceEnvelope[];
  latestRun: BillingReconciliationRun | null;
  openFindings: BillingReconciliationFinding[];
  transitionRows: RuntimeTransitionLogRow[];
  incidentRows: RuntimeIncidentTimelineRow[];
  recoveryActionRows: RuntimeRecoveryActionRow[];
  eventOutboxRows: EventOutboxRow[];
}) {
  const selectedIds = new Set(input.evidenceItems.map((item) => item.id));
  const selectedTraceIds = new Set(input.evidenceItems.map(evidencePrimaryTrace).filter(Boolean));
  const selectedRunIds = new Set(input.evidenceItems.map((item) => item.traceIds.reconciliationRunId).filter(Boolean));

  return {
    exported_at: new Date().toISOString(),
    tenant_id: input.tenantId,
    session: input.selectedSession,
    timeline: input.evidenceItems.map((item) => ({
      id: item.id,
      at: item.createdAt,
      category: item.category,
      failure_kind: item.failureKind,
      runtime_effect: item.runtimeEffect,
      recovery_contract: item.recoveryContract,
      label: item.label,
      detail: item.detail,
      trace_ids: item.traceIds,
      source: item.source,
      source_id: item.sourceId,
    })),
    reconciliation_lineage: {
      latest_run: input.latestRun ? {
        id: input.latestRun.id,
        status: input.latestRun.status,
        completed_at: input.latestRun.completed_at,
        finding_count: input.latestRun.finding_count,
        critical_count: input.latestRun.critical_count,
        trace_ids: evidenceFromReconciliationRun(input.latestRun).traceIds,
      } : null,
      findings: input.openFindings
        .filter((finding) => {
          const evidence = evidenceFromReconciliationFinding(finding);
          return selectedRunIds.has(finding.run_id) || selectedTraceIds.has(evidencePrimaryTrace(evidence));
        })
        .map((finding) => ({
          id: finding.id,
          run_id: finding.run_id,
          finding_code: finding.finding_code,
          severity: finding.severity,
          status: finding.status,
          detected_at: finding.detected_at,
          resolved_at: finding.resolved_at,
          trace_ids: evidenceFromReconciliationFinding(finding).traceIds,
        })),
    },
    related_transitions: input.transitionRows
      .filter((row) => {
        const evidence = evidenceFromRuntimeTransition(row);
        return selectedIds.has(evidence.id) || selectedTraceIds.has(evidencePrimaryTrace(evidence));
      })
      .map((row) => ({
        id: row.id,
        transition_type: row.transition_type,
        status: row.status,
        started_at: row.started_at,
        completed_at: row.completed_at,
        trace_ids: evidenceFromRuntimeTransition(row).traceIds,
      })),
    related_recovery: {
      incidents: input.incidentRows
        .filter((row) => {
          const evidence = evidenceFromRuntimeIncident(row);
          return selectedIds.has(evidence.id) || selectedTraceIds.has(evidencePrimaryTrace(evidence));
        })
        .map((row) => ({
          id: row.id,
          incident_type: row.incident_type,
          severity: row.severity,
          runtime_health: row.runtime_health,
          runtime_mode: row.runtime_mode,
          detected_at: row.detected_at,
          trace_ids: evidenceFromRuntimeIncident(row).traceIds,
        })),
      actions: input.recoveryActionRows
        .filter((row) => {
          const evidence = evidenceFromRecoveryAction(row);
          return selectedIds.has(evidence.id) || selectedTraceIds.has(evidencePrimaryTrace(evidence));
        })
        .map((row) => ({
          id: row.id,
          incident_id: row.incident_id,
          recovery_class: row.recovery_class,
          action_status: row.action_status,
          triggered_by: row.triggered_by,
          started_at: row.started_at,
          completed_at: row.completed_at,
          trace_ids: evidenceFromRecoveryAction(row).traceIds,
        })),
    },
    delivery_attempts: input.eventOutboxRows
      .filter((row) => {
        const evidence = evidenceFromEventOutbox(row);
        return selectedIds.has(evidence.id) || selectedTraceIds.has(evidencePrimaryTrace(evidence));
      })
      .map((row) => ({
        id: row.id,
        event_type: row.event_type,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_id,
        handler_name: row.handler_name,
        delivery_guarantee: row.delivery_guarantee,
        status: row.status,
        attempts: row.attempts,
        max_attempts: row.max_attempts,
        next_retry_at: row.next_retry_at,
        processed_at: row.processed_at,
        last_error: row.last_error,
        trace_ids: evidenceFromEventOutbox(row).traceIds,
      })),
  };
}

function useOpsStore() {
  return useSyncExternalStore(
    platform.coordination.readModels.subscribeOps,
    platform.coordination.readModels.getOpsSnapshot,
    () => platform.coordination.readModels.serverOpsSnapshot,
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
  const [eventOutboxSummary, setEventOutboxSummary] = useState<EventOutboxSummary | null>(null);
  const [eventOutboxRows, setEventOutboxRows] = useState<EventOutboxRow[]>([]);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [loadingOps, setLoadingOps] = useState(false);
  const [runningDry, setRunningDry] = useState(false);
  const [runningLive, setRunningLive] = useState(false);
  const [actionFindingId, setActionFindingId] = useState<string | null>(null);
  const [replayingOutboxId, setReplayingOutboxId] = useState<string | null>(null);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const incidentTimeline = useMemo(() => buildIncidentTimeline({
    latestRun,
    dryRunSummary,
    openFindings,
    transitionRows,
    incidentRows,
    recoveryActionRows,
    eventOutboxRows,
  }), [latestRun, dryRunSummary, openFindings, transitionRows, incidentRows, recoveryActionRows, eventOutboxRows]);
  const incidentSessions = useMemo(() => buildIncidentSessions(incidentTimeline), [incidentTimeline]);
  const selectedSession = incidentSessions.find((session) => session.key === selectedSessionKey) ?? incidentSessions[0] ?? null;
  const selectedEvidenceItems = useMemo(
    () => incidentTimeline.filter((item) => matchesEvidenceSession(item, selectedSession?.key ?? null)),
    [incidentTimeline, selectedSession],
  );
  const relatedTransitions = selectedEvidenceItems.filter((item) => item.category === "runtime_transition");
  const relatedWorkflows = [...new Set(selectedEvidenceItems.map((item) => item.traceIds.workflowTraceId).filter(Boolean))];
  const reconciliationLineage = selectedEvidenceItems.filter((item) => item.category === "reconciliation");
  const deliveryAttempts = selectedEvidenceItems.filter((item) => item.source === "event_outbox");
  const criticalFindings = useMemo(
    () => openFindings.filter((finding) => finding.severity === "critical"),
    [openFindings],
  );
  const oldestCriticalFinding = criticalFindings
    .slice()
    .sort((a, b) => new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime())[0] ?? null;
  const findingCodeSummary = useMemo(() => buildFindingCodeSummary(openFindings), [openFindings]);
  const runtimeModeLabel = "effectiveMode" in snap.effective
    ? String(snap.effective.effectiveMode)
    : String(snap.effective.mode);

  const refreshOps = useCallback(async () => {
    if (!effectiveTenantId) {
      setLatestRun(null);
      setOpenFindings([]);
      setTransitionRows([]);
      setIncidentRows([]);
      setRecoveryActionRows([]);
      setEventOutboxSummary(null);
      setEventOutboxRows([]);
      return;
    }
    setLoadingOps(true);
    setOpsError(null);
    try {
      const [reconciliation, transitions, incidents, recoveryActions, outboxSummary, outboxRows] = await Promise.all([
        billingReconciliationService.getOpsSnapshot(),
        listRecentRuntimeTransitionLogRows(6),
        listRecentRuntimeIncidents(6),
        listRecentRuntimeRecoveryActions(8),
        eventOutboxRepository.getSummary(effectiveTenantId),
        eventOutboxRepository.listRecent(12, effectiveTenantId),
      ]);
      setLatestRun(reconciliation.latestRun);
      setOpenFindings(reconciliation.openFindings);
      setTransitionRows(transitions);
      setIncidentRows(incidents);
      setRecoveryActionRows(recoveryActions);
      setEventOutboxSummary(outboxSummary);
      setEventOutboxRows(outboxRows);
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

  const updateFindingStatus = async (
    findingId: string,
    status: "ACKNOWLEDGED" | "INVESTIGATING" | "RESOLVED" | "FALSE_POSITIVE",
    errorMessage: string,
  ) => {
    setActionFindingId(findingId);
    setOpsError(null);
    try {
      await billingReconciliationService.updateFindingStatus(findingId, status);
      await refreshOps();
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : errorMessage);
    } finally {
      setActionFindingId(null);
    }
  };

  const markFindingAcknowledged = async (findingId: string) => {
    await updateFindingStatus(findingId, "ACKNOWLEDGED", "Failed to acknowledge finding");
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

  const exportForensicBundle = () => {
    const bundle = buildForensicBundle({
      tenantId: effectiveTenantId,
      selectedSession,
      evidenceItems: selectedEvidenceItems,
      latestRun,
      openFindings,
      transitionRows,
      incidentRows,
      recoveryActionRows,
      eventOutboxRows,
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `runtime-ops-forensic-${effectiveTenantId ?? "tenant"}-${selectedSession?.key ?? "evidence"}-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const replayOutboxEvent = async (eventId: string) => {
    setReplayingOutboxId(eventId);
    setOpsError(null);
    try {
      await eventOutboxRepository.replay([eventId]);
      await refreshOps();
    } catch (error) {
      setOpsError(error instanceof Error ? error.message : "Failed to replay event delivery");
    } finally {
      setReplayingOutboxId(null);
    }
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
            <li>Mode: {runtimeModeLabel}</li>
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
        <div className="rounded-lg border bg-card p-4 text-sm md:col-span-3">
          <h2 className="mb-2 font-medium">Durable event delivery</h2>
          <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-6">
            <span>Backlog: {eventOutboxSummary?.backlog_count ?? 0}</span>
            <span>Processing: {eventOutboxSummary?.processing_count ?? 0}</span>
            <span>Retry: {eventOutboxSummary?.retry_count ?? 0}</span>
            <span>Failed: {eventOutboxSummary?.failed_count ?? 0}</span>
            <span>Dead letters: {eventOutboxSummary?.dead_letter_count ?? 0}</span>
            <span>Oldest: {eventOutboxSummary?.oldest_undelivered_at ? new Date(eventOutboxSummary.oldest_undelivered_at).toLocaleString() : "-"}</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Incident timeline</h2>
            <p className="mt-1 text-xs text-muted-foreground">Ordered operational evidence across runtime, reconciliation, recovery, and event delivery.</p>
          </div>
          <div className="text-xs text-muted-foreground">
            Trace-linked rows: {incidentTimeline.filter((item) => evidencePrimaryTrace(item)).length}/{incidentTimeline.length}
          </div>
        </div>
        {incidentSessions.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-medium uppercase text-muted-foreground">Grouped incident sessions</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={exportForensicBundle}
                disabled={!selectedSession || selectedEvidenceItems.length === 0}
              >
                Export forensic bundle
              </Button>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {incidentSessions.map((session) => (
                <button
                  key={session.key}
                  type="button"
                  onClick={() => setSelectedSessionKey(session.key)}
                  className={`rounded border p-3 text-left text-xs transition-colors ${selectedSession?.key === session.key ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <span className="block break-all font-medium text-foreground">{session.label}</span>
                  <span className="mt-1 block text-muted-foreground">{session.itemCount} rows; {session.kinds.join(", ")}</span>
                  <span className="mt-1 block text-muted-foreground">Primary cause: {session.primaryCause}</span>
                  <span className="mt-1 block text-muted-foreground">Window: {formatDateTime(session.firstAt)} - {formatDateTime(session.lastAt)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {selectedSession ? (
          <div className="mt-4 rounded border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-medium uppercase text-muted-foreground">Evidence drill-down</h3>
                <p className="mt-1 break-all text-xs text-muted-foreground">{selectedSession.label}</p>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
                <span>Related transitions: {relatedTransitions.length}</span>
                <span>Affected workflows: {relatedWorkflows.length}</span>
                <span>Reconciliation lineage: {reconciliationLineage.length}</span>
                <span>Delivery attempts: {deliveryAttempts.length}</span>
              </div>
            </div>
            <div className="mt-3 grid gap-3 text-xs text-muted-foreground md:grid-cols-4">
              <div>
                <h4 className="mb-1 font-medium text-foreground">Show related transitions</h4>
                {relatedTransitions.length === 0 ? "-" : relatedTransitions.map((item) => (
                  <span key={item.id} className="block">{item.detail ?? item.failureKind} {item.label ?? item.runtimeEffect}</span>
                ))}
              </div>
              <div>
                <h4 className="mb-1 font-medium text-foreground">Show affected workflows</h4>
                {relatedWorkflows.length === 0 ? "-" : relatedWorkflows.map((workflow) => (
                  <span key={workflow} className="block break-all">{workflow}</span>
                ))}
              </div>
              <div>
                <h4 className="mb-1 font-medium text-foreground">Show reconciliation lineage</h4>
                {reconciliationLineage.length === 0 ? "-" : reconciliationLineage.map((item) => (
                  <span key={item.id} className="block">{evidenceKind(item)}: {item.detail ?? item.failureKind}</span>
                ))}
              </div>
              <div>
                <h4 className="mb-1 font-medium text-foreground">Show delivery attempts</h4>
                {deliveryAttempts.length === 0 ? "-" : deliveryAttempts.map((item) => (
                  <span key={item.id} className="block">{item.detail ?? item.failureKind} {item.label ?? item.runtimeEffect}</span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {incidentTimeline.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No timeline evidence visible for this tenant.</p>
        ) : (
          <ol className="mt-4 space-y-2 text-xs text-muted-foreground">
            {incidentTimeline.map((item) => (
              <li key={item.id} className="grid gap-2 rounded border p-3 md:grid-cols-[160px_150px_1fr]">
                <span>{formatDateTime(item.createdAt)}</span>
                <span className="font-medium text-foreground">{evidenceKind(item)}</span>
                <span>
                  <span className="font-medium text-foreground">{item.label ?? item.runtimeEffect}</span>
                  {" "}{item.detail ?? item.failureKind}
                  <span className="block">Effect: {item.runtimeEffect}; failure: {item.failureKind}</span>
                  {evidencePrimaryTrace(item) ? <span className="block break-all">Trace: {evidencePrimaryTrace(item)}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <h2 className="mb-3 font-medium">Reconciliation trends</h2>
        <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-5">
          <span>Open critical: {criticalFindings.length}</span>
          <span>Oldest critical age: {ageLabel(oldestCriticalFinding?.detected_at)}</span>
          <span>Last run age: {ageLabel(latestRun?.completed_at)}</span>
          <span>Last run status: {latestRun?.status ?? "-"}</span>
          <span>Failed deliveries: {(eventOutboxSummary?.failed_count ?? 0) + (eventOutboxSummary?.dead_letter_count ?? 0)}</span>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Repeated finding codes: </span>
          {findingCodeSummary.length === 0
            ? "none"
            : findingCodeSummary.map(([code, count]) => `${code} (${count})`).join(", ")}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Event outbox</h2>
            <p className="mt-1 text-xs text-muted-foreground">Durable handler delivery with retry, dead-letter, and replay controls.</p>
          </div>
        </div>
        {eventOutboxRows.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">No undelivered event rows visible for this tenant.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Event</th>
                  <th className="py-2 pr-3 font-medium">Handler</th>
                  <th className="py-2 pr-3 font-medium">Guarantee</th>
                  <th className="py-2 pr-3 font-medium">Attempts</th>
                  <th className="py-2 pr-3 font-medium">Next retry</th>
                  <th className="py-2 pr-3 font-medium">Trace</th>
                  <th className="py-2 pr-3 font-medium">Error</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {eventOutboxRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2 pr-3">{row.status}</td>
                    <td className="py-2 pr-3">
                      <span className="block font-medium">{row.event_type}</span>
                      <span className="block text-muted-foreground">{row.aggregate_type}: {row.aggregate_id ?? "-"}</span>
                    </td>
                    <td className="py-2 pr-3">{row.handler_name}</td>
                    <td className="py-2 pr-3">{row.delivery_guarantee}</td>
                    <td className="py-2 pr-3">{row.attempts}/{row.max_attempts}</td>
                    <td className="py-2 pr-3">{row.next_retry_at ? new Date(row.next_retry_at).toLocaleString() : "-"}</td>
                    <td className="py-2 pr-3">{row.workflow_trace_id ?? row.operation_trace_id ?? row.request_trace_id ?? "-"}</td>
                    <td className="max-w-[220px] truncate py-2 pr-3" title={row.last_error ?? undefined}>{row.last_error ?? "-"}</td>
                    <td className="py-2 pr-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void replayOutboxEvent(row.id)}
                        disabled={replayingOutboxId === row.id || !["FAILED", "DEAD_LETTER", "RETRY"].includes(row.status)}
                      >
                        {replayingOutboxId === row.id ? "Replaying" : "Replay"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
                    <th className="py-2 pr-3 font-medium">Actions</th>
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
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void markFindingAcknowledged(finding.id)}
                            disabled={actionFindingId === finding.id || finding.status === "ACKNOWLEDGED"}
                          >
                            Acknowledge
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void updateFindingStatus(finding.id, "INVESTIGATING", "Failed to mark finding as investigating")}
                            disabled={actionFindingId === finding.id || finding.status === "INVESTIGATING"}
                          >
                            Investigate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void updateFindingStatus(finding.id, "RESOLVED", "Failed to resolve finding")}
                            disabled={actionFindingId === finding.id}
                          >
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void updateFindingStatus(finding.id, "FALSE_POSITIVE", "Failed to mark finding false positive")}
                            disabled={actionFindingId === finding.id}
                          >
                            False positive
                          </Button>
                        </div>
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
