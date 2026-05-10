/**
 * Central realtime gateway: registry, reconciliation, metrics, policy-aware filtering.
 * Hooks register intent only; this module owns channel lifecycle and teardown ordering.
 */
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { emitCoordinationMetric } from "@/platform/runtime/coordination/coordinationTelemetry";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { runtimeEventBus } from "@/platform/runtime/coordination/runtimeEventBus";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { RuntimeMode } from "@/platform/runtime/policy";
import {
  realtimeRepository,
  type RealtimePrincipalContext,
  type RealtimeTable,
} from "@/services/realtime/realtime.repository";

/** Tables whose changefeeds are primarily mutation-driven; omitted in read-focused runtime modes. */
const MUTATION_HEAVY_REALTIME_TABLES = new Set<RealtimeTable>([
  "appointments",
  "appointment_queue",
  "invoices",
  "medications",
  "lab_orders",
  "insurance_claims",
]);

function filterTablesForRuntimePolicy(tables: RealtimeTable[]): RealtimeTable[] {
  const mode = runtimeModeController.getSnapshot().effective.effectiveMode;
  if (mode !== RuntimeMode.READONLY && mode !== RuntimeMode.SAFE_MODE && mode !== RuntimeMode.INCIDENT) {
    return tables;
  }
  const next = tables.filter((t) => !MUTATION_HEAVY_REALTIME_TABLES.has(t));
  if (next.length < tables.length) {
    emitCoordinationMetric("coordination.realtime_policy_filtered", {
      mode,
      droppedTables: tables.filter((t) => MUTATION_HEAVY_REALTIME_TABLES.has(t)).join(","),
    });
  }
  return next;
}

/** Bounded backoff schedule for internal resubscribe hooks (future worker retries). */
export const REALTIME_RECONNECT_BACKOFF_MS = [0, 1_000, 3_000, 10_000] as const;
export type RealtimeConnectionState =
  | "CONNECTED"
  | "DEGRADED"
  | "PARTITIONED"
  | "RECOVERING"
  | "RESYNCING";

const MAX_REPLAY_DRIFT_MS = 30_000;
const STALE_SUBSCRIPTION_MS = 60_000;
let realtimeConnectionState: RealtimeConnectionState = "CONNECTED";
let lastRealtimeChangeAt = Date.now();
let lastRealtimeRecoveryAt: number | null = null;

export type SubscribeEntityParams = {
  ctx: RealtimePrincipalContext;
  tables: RealtimeTable[];
  onEvent: () => void;
};

type RegistryEntry = {
  key: string;
  desired: SubscribeEntityParams;
  activeUnsubscribe: (() => void) | null;
  lastIdentity: string;
};

const registry = new Map<string, RegistryEntry>();
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 80;
let churnCount = 0;
let churnWindowStart = Date.now();
const MAX_CHURN_PER_SEC = 24;
let coordinationHooksInstalled = false;

function channelIdentity(ctx: RealtimePrincipalContext, tables: RealtimeTable[]): string {
  const tablesKey = [...new Set(tables)].sort().join("|");
  const pk = ctx.sessionVersion ?? `u:${ctx.userId}`;
  return `${ctx.tenantId}:${pk}:${tablesKey}`;
}

function installCoordinationReconcileHooks() {
  if (coordinationHooksInstalled || typeof window === "undefined") return;
  coordinationHooksInstalled = true;
  runtimeModeController.subscribe(() => scheduleReconcile());
  runtimeEpochManager.subscribe(() => scheduleReconcile());
  const types = [
    "TENANT_CONTEXT_CHANGED",
    "POLICY_ENFORCEMENT_CHANGED",
    "RUNTIME_MODE_CHANGED",
    "INCIDENT_MODE_ENTERED",
  ] as const;
  for (const t of types) {
    runtimeEventBus.subscribe(t, () => scheduleReconcile());
  }
}

function scheduleReconcile() {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    reconcileAllInternal();
  }, DEBOUNCE_MS);
}

function openChannel(params: SubscribeEntityParams): { unsubscribe: () => void } {
  const tables = filterTablesForRuntimePolicy(params.tables);
  if (tables.length === 0) {
    emitPlatformMetric("realtime_subscribe_empty", { tenantId: params.ctx.tenantId });
    return { unsubscribe: () => {} };
  }
  const tablesKey = [...new Set(tables)].sort().join("|");
  emitPlatformMetric("realtime_subscribe", {
    tenantId: params.ctx.tenantId,
    tablesKey,
    hasSessionVersion: Boolean(params.ctx.sessionVersion),
  });

  const inner = realtimeRepository.subscribeToTenantTables(params.ctx, tables, () => {
    lastRealtimeChangeAt = Date.now();
    emitPlatformMetric("realtime_change", { tenantId: params.ctx.tenantId, tablesKey });
    params.onEvent();
  });

  return {
    unsubscribe: () => {
      emitPlatformMetric("realtime_unsubscribe", { tenantId: params.ctx.tenantId, tablesKey });
      inner.unsubscribe();
    },
  };
}

function attachIfNeeded(entry: RegistryEntry) {
  const filtered = filterTablesForRuntimePolicy(entry.desired.tables);
  if (filtered.length === 0) {
    entry.activeUnsubscribe?.();
    entry.activeUnsubscribe = null;
    entry.lastIdentity = "";
    return;
  }
  const id = channelIdentity(entry.desired.ctx, filtered);
  if (entry.activeUnsubscribe && entry.lastIdentity === id) return;
  entry.activeUnsubscribe?.();
  const sub = openChannel({ ...entry.desired, tables: filtered });
  entry.activeUnsubscribe = sub.unsubscribe;
  entry.lastIdentity = id;
}

function reconcileAllInternal() {
  const now = Date.now();
  if (now - churnWindowStart > 1000) {
    churnCount = 0;
    churnWindowStart = now;
  }
  churnCount++;
  if (churnCount > MAX_CHURN_PER_SEC) {
    emitPlatformMetric("realtime_reconcile_throttled", { churnCount });
    realtimeConnectionState = churnCount > MAX_CHURN_PER_SEC * 2 ? "PARTITIONED" : "DEGRADED";
    churnCount = 0;
    churnWindowStart = now;
    scheduleReconcile();
    return;
  }

  for (const entry of registry.values()) {
    attachIfNeeded(entry);
  }
  realtimeConnectionState = "CONNECTED";
}

/** Tear down all active channels; registry entries remain and will reconnect on next reconcile. */
export function disconnectAllRegisteredRealtime() {
  realtimeConnectionState = "RECOVERING";
  for (const e of registry.values()) {
    e.activeUnsubscribe?.();
    e.activeUnsubscribe = null;
    e.lastIdentity = "";
  }
}

/**
 * Force all registry entries to drop channel identity and reconnect on next reconcile.
 */
export function reconcileAll(opts?: { force?: boolean }) {
  if (opts?.force) {
    realtimeConnectionState = "RESYNCING";
    for (const e of registry.values()) {
      e.lastIdentity = "";
    }
  }
  lastRealtimeRecoveryAt = Date.now();
  reconcileAllInternal();
}

/**
 * Register subscription intent. The runtime owns channel lifecycle; callers must not call Supabase directly.
 * @returns unregister function (teardown intent).
 */
export function registerRealtimeSubscriptionIntent(subscriberKey: string, params: SubscribeEntityParams): () => void {
  installCoordinationReconcileHooks();
  registry.set(subscriberKey, {
    key: subscriberKey,
    desired: params,
    activeUnsubscribe: null,
    lastIdentity: "",
  });
  scheduleReconcile();
  return () => {
    const e = registry.get(subscriberKey);
    e?.activeUnsubscribe?.();
    registry.delete(subscriberKey);
  };
}

/**
 * Subscribe to postgres_changes for tenant tables with principal-bound channel identity.
 * Prefer {@link registerRealtimeSubscriptionIntent} from hooks for automatic reconciliation.
 */
export function subscribeEntity(params: SubscribeEntityParams): { unsubscribe: () => void } {
  const key = `ephemeral:${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  const off = registerRealtimeSubscriptionIntent(key, params);
  return { unsubscribe: off };
}

/** Operator / governance: bounded snapshot of subscription registry health (browser only). */
export function getRealtimeRegistryDiagnostics(): {
  intentCount: number;
  activeChannelCount: number;
  churnThrottledRecently: boolean;
  connectionState: RealtimeConnectionState;
  maxReplayDriftMs: number;
  staleSubscriptionThresholdMs: number;
  replayDriftMs: number;
  lastRecoveryAt: number | null;
} {
  let activeChannelCount = 0;
  for (const e of registry.values()) {
    if (e.activeUnsubscribe) activeChannelCount++;
  }
  const replayDriftMs = Date.now() - lastRealtimeChangeAt;
  if (registry.size > 0 && activeChannelCount === 0) {
    realtimeConnectionState = "PARTITIONED";
  } else if (registry.size > 0 && replayDriftMs > STALE_SUBSCRIPTION_MS) {
    realtimeConnectionState = "DEGRADED";
  }
  return {
    intentCount: registry.size,
    activeChannelCount,
    churnThrottledRecently: churnCount > MAX_CHURN_PER_SEC / 2,
    connectionState: realtimeConnectionState,
    maxReplayDriftMs: MAX_REPLAY_DRIFT_MS,
    staleSubscriptionThresholdMs: STALE_SUBSCRIPTION_MS,
    replayDriftMs,
    lastRecoveryAt: lastRealtimeRecoveryAt,
  };
}
