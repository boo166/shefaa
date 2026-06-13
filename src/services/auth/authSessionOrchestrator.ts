import { queryClient } from "@/services/query/queryClient.instance";
import { abortAllAuthBoundary } from "./authAbortRegistry";
import { emitAuthMetric } from "./authMetrics";
import type { AuthMachineState } from "./authStateMachine";

export type AuthTransitionEventV1 = {
  v: 1;
  eventId: string;
  originTabId: string;
  principalKey: string;
  type: "SIGNED_OUT" | "USER_CHANGED" | "TENANT_CHANGED" | "LOGOUT" | "BOUNDARY_RESET" | "SESSION_VERSION_CHANGED";
  occurredAt: number;
  authTraceId: string;
};

const EVENT_DEDUP_TTL_MS = 10_000;
const CLEANUP_ONCE_TTL_MS = 30_000;
const REPLAY_MAX_AGE_MS = 30_000;
const LEASE_TTL_MS = 5_000;
const LEASE_KEY = "shefaa_auth_leader_lease";
const BC_NAME = "shefaa-auth-sync";
const STORAGE_FALLBACK = "shefaa-auth-sync-fallback";

type LeaseRecord = { tabId: string; until: number };

type Handlers = {
  getTabId: () => string;
  getPrincipalKey: () => string;
  getPrincipalParts: () => { userId: string; tenantId: string };
  resetAuthStores: () => void | Promise<void>;
  setAuthMachineState: (next: AuthMachineState) => void;
  getAuthMachineState: () => AuthMachineState;
  getAuthProjection: () => { isAuthenticated: boolean; userId: string | null };
};

let handlers: Handlers | null = null;

const processedEvents = new Map<string, number>();
const cleanupOnceKeys = new Map<string, number>();

let broadcastChannel: BroadcastChannel | null = null;
let storageListener: ((e: StorageEvent) => void) | null = null;
let leaseHeartbeat: ReturnType<typeof setInterval> | null = null;
let driftTimer: ReturnType<typeof setInterval> | null = null;

function principalPartsFromKey(principalKey: string): { userId: string; tenantId: string } {
  const [userId, tenantId] = principalKey.split(":");
  return {
    userId: userId || "anon",
    tenantId: tenantId || "none",
  };
}

function pruneMap(map: Map<string, number>, ttlMs: number) {
  const now = Date.now();
  for (const [k, t] of map) {
    if (now - t > ttlMs) map.delete(k);
  }
}

function getTabIdInternal(): string {
  if (typeof sessionStorage === "undefined") return "ssr";
  try {
    let id = sessionStorage.getItem("shefaa_tab_id");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("shefaa_tab_id", id);
    }
    return id;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}`;
  }
}

function readLease(): LeaseRecord | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(LEASE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LeaseRecord;
  } catch {
    return null;
  }
}

function writeLease(tabId: string) {
  const until = Date.now() + LEASE_TTL_MS;
  localStorage.setItem(LEASE_KEY, JSON.stringify({ tabId, until } satisfies LeaseRecord));
}

export function isLeaderLeaseHolder(): boolean {
  const tabId = handlers?.getTabId() ?? getTabIdInternal();
  const lease = readLease();
  if (!lease) return false;
  if (Date.now() > lease.until) return false;
  return lease.tabId === tabId;
}

function tryAcquireOrRenewLease(): boolean {
  const tabId = handlers?.getTabId() ?? getTabIdInternal();
  const now = Date.now();
  const lease = readLease();
  if (!lease || now > lease.until || lease.tabId === tabId) {
    writeLease(tabId);
    return true;
  }
  return false;
}

function startLeaseHeartbeat() {
  if (leaseHeartbeat || typeof window === "undefined") return;
  leaseHeartbeat = setInterval(() => {
    if (document.visibilityState === "visible" && isLeaderLeaseHolder()) {
      tryAcquireOrRenewLease();
    }
  }, Math.floor(LEASE_TTL_MS / 2));
}

const SCOPED_STORAGE_KEY_PATTERNS = [
  /^shefaa-cache:([^:]+):([^:]+):/,
  /^shefaa-features:([^:]+):([^:]+):/,
  /^lang:([^:]+):([^:]+)$/,
  /^calendar:([^:]+):([^:]+)$/,
] as const;

function isPreAuthSentinelScope(keyTenantId: string, keyUserId: string) {
  return keyTenantId === "public" && keyUserId === "anon";
}

/** Removes scoped localStorage keys that do not match the active principal (leader tab only). */
export function purgeCrossPrincipalScopedStorageLeaderOnly(expected: { userId: string; tenantId: string }) {
  if (typeof localStorage === "undefined") return;
  if (!tryAcquireOrRenewLease() && !isLeaderLeaseHolder()) return;

  const { userId, tenantId } = expected;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    for (const pattern of SCOPED_STORAGE_KEY_PATTERNS) {
      const match = k.match(pattern);
      if (!match) continue;
      const [, keyTenantId, keyUserId] = match;
      if (isPreAuthSentinelScope(keyTenantId, keyUserId)) break;
      if (keyTenantId !== tenantId || keyUserId !== userId) {
        toRemove.push(k);
      }
      break;
    }
  }
  for (const k of toRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function clearTenantScopedStorageLeaderOnly(parts: { userId: string; tenantId: string }) {
  if (typeof localStorage === "undefined") return;
  if (!tryAcquireOrRenewLease() && !isLeaderLeaseHolder()) return;

  const { userId, tenantId } = parts;
  const prefixes = [
    `lang:${tenantId}:${userId}`,
    `calendar:${tenantId}:${userId}`,
    `lang:public:${userId}`,
    `calendar:public:${userId}`,
  ];
  for (const p of prefixes) {
    try {
      localStorage.removeItem(p);
    } catch {
      /* ignore */
    }
  }

  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("shefaa-cache:") && (k.includes(tenantId) || k.includes(userId))) {
      toRemove.push(k);
    }
    if (k.startsWith("shefaa-features:") && (k.includes(tenantId) || k.includes(userId))) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function clearAllPrincipalScopedPreferencesLeaderOnly() {
  if (typeof localStorage === "undefined") return;
  if (!tryAcquireOrRenewLease() && !isLeaderLeaseHolder()) return;

  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("lang:") || k.startsWith("calendar:")) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

function isDuplicateEvent(eventId: string): boolean {
  pruneMap(processedEvents, EVENT_DEDUP_TTL_MS);
  if (processedEvents.has(eventId)) return true;
  processedEvents.set(eventId, Date.now());
  return false;
}

function shouldRejectReplay(occurredAt: number) {
  if (Date.now() - occurredAt > REPLAY_MAX_AGE_MS) {
    emitAuthMetric("auth_event_replay_rejected", { ageMs: Date.now() - occurredAt });
    return true;
  }
  return false;
}

async function runCleanupOnce(key: string, fn: () => Promise<void>) {
  pruneMap(cleanupOnceKeys, CLEANUP_ONCE_TTL_MS);
  const now = Date.now();
  if (cleanupOnceKeys.has(key)) return;
  cleanupOnceKeys.set(key, now);
  await fn();
}

async function runPerTabBoundaryReset(event: AuthTransitionEventV1, parts: { userId: string; tenantId: string }) {
  emitAuthMetric("cache_cleared", { type: event.type, authTraceId: event.authTraceId });
  await queryClient.cancelQueries();
  queryClient.clear();
  abortAllAuthBoundary(event.authTraceId);
  await Promise.resolve(handlers?.resetAuthStores());
  if (!isLeaderLeaseHolder()) {
    tryAcquireOrRenewLease();
  }
  if (isLeaderLeaseHolder()) {
    if (
      event.type === "USER_CHANGED"
      || event.type === "SIGNED_OUT"
      || event.type === "BOUNDARY_RESET"
      || event.type === "TENANT_CHANGED"
    ) {
      // These transitions can leave behind scoped keys from a different principal (user/tenant).
      // Clearing all principal-scoped preference keys avoids cross-user leakage.
      clearAllPrincipalScopedPreferencesLeaderOnly();
    }
    clearTenantScopedStorageLeaderOnly(parts);
    const projection = handlers?.getAuthProjection();
    if (projection?.isAuthenticated && projection.userId) {
      purgeCrossPrincipalScopedStorageLeaderOnly(handlers!.getPrincipalParts());
    }
  }
  if (import.meta.env.DEV) {
    queueMicrotask(() => {
      const residue = queryClient.getQueryCache().getAll().length;
      if (residue > 0) {
        console.warn("[auth] query cache non-empty after boundary reset", residue);
      }
    });
  }
}

export function attachAuthSessionOrchestrator(next: Handlers) {
  handlers = {
    ...next,
    getTabId: next.getTabId ?? getTabIdInternal,
  };
}

export function broadcastAuthEvent(event: AuthTransitionEventV1) {
  emitAuthMetric("multi_tab_event", { type: event.type, originTabId: event.originTabId });
  try {
    broadcastChannel?.postMessage(event);
  } catch {
    /* ignore */
  }
  try {
    const payload = JSON.stringify(event);
    localStorage.setItem(STORAGE_FALLBACK, payload);
    localStorage.removeItem(STORAGE_FALLBACK);
  } catch {
    /* ignore */
  }
}

async function ingestAuthEvent(event: AuthTransitionEventV1, fromBroadcast: boolean) {
  if (event.v !== 1) return;
  if (shouldRejectReplay(event.occurredAt)) return;
  if (isDuplicateEvent(event.eventId)) return;

  const h = handlers;
  if (!h) return;

  if (fromBroadcast) {
    const currentPk = h.getPrincipalKey();
    if (currentPk !== "anon:none" && event.principalKey !== currentPk) {
      emitAuthMetric("auth_event_replay_rejected", { reason: "principal_mismatch" });
      return;
    }
  }

  const parts = principalPartsFromKey(event.principalKey);
  const cleanupKey = `${event.principalKey}:${event.eventId}`;
  emitAuthMetric("principal_change", {
    type: event.type,
    fromBroadcast,
    authTraceId: event.authTraceId,
  });

  await runCleanupOnce(cleanupKey, async () => {
    await runPerTabBoundaryReset(event, parts);
  });

  if (event.type === "SIGNED_OUT" || event.type === "LOGOUT") {
    if (h.getAuthMachineState() !== "unauthenticated_pending_cleanup") {
      h.setAuthMachineState("unauthenticated");
    }
  }
}

export async function runAuthCleanupEvent(event: AuthTransitionEventV1): Promise<void> {
  const h = handlers;
  if (!h) return;
  if (shouldRejectReplay(event.occurredAt)) return;
  if (isDuplicateEvent(event.eventId)) return;
  const parts = principalPartsFromKey(event.principalKey);
  const cleanupKey = `${event.principalKey}:${event.eventId}`;
  await runCleanupOnce(cleanupKey, async () => {
    await runPerTabBoundaryReset(event, parts);
  });
}

/** Clears React Query, aborts in-flight work, and tenant-scoped storage — keeps Supabase session and Zustand user (e.g. super-admin tenant switch). */
export async function runTenantScopedCacheReset(params: {
  previousPrincipalParts: { userId: string; tenantId: string };
  authTraceId: string;
}): Promise<void> {
  emitAuthMetric("cache_cleared", { reason: "tenant_scope", authTraceId: params.authTraceId });
  await queryClient.cancelQueries();
  queryClient.clear();
  abortAllAuthBoundary(params.authTraceId);
  if (!isLeaderLeaseHolder()) {
    tryAcquireOrRenewLease();
  }
  if (isLeaderLeaseHolder()) {
    clearAllPrincipalScopedPreferencesLeaderOnly();
    clearTenantScopedStorageLeaderOnly(params.previousPrincipalParts);
  }
}

export async function runPrincipalBoundaryIfNeeded(params: {
  prevPrincipalKey: string | null;
  nextPrincipalKey: string;
  nextSessionVersion: string;
  prevSessionVersion: string | null;
  authTraceId: string;
}): Promise<void> {
  const changed
    = params.prevPrincipalKey !== null
      && (params.prevPrincipalKey !== params.nextPrincipalKey || params.prevSessionVersion !== params.nextSessionVersion);
  if (!changed) return;

  const originTabId = handlers?.getTabId() ?? getTabIdInternal();
  const [prevUser] = (params.prevPrincipalKey ?? "").split(":");
  const [nextUser] = params.nextPrincipalKey.split(":");
  const boundaryType: AuthTransitionEventV1["type"]
    = prevUser !== nextUser ? "USER_CHANGED" : params.prevPrincipalKey !== params.nextPrincipalKey ? "TENANT_CHANGED" : "SESSION_VERSION_CHANGED";
  const event: AuthTransitionEventV1 = {
    v: 1,
    eventId: crypto.randomUUID(),
    originTabId,
    principalKey: params.prevPrincipalKey ?? params.nextPrincipalKey,
    type: boundaryType,
    occurredAt: Date.now(),
    authTraceId: params.authTraceId,
  };
  await runAuthCleanupEvent(event);
  broadcastAuthEvent(event);
}

export function initAuthMultiTabSync() {
  if (typeof window === "undefined" || broadcastChannel) return;
  try {
    broadcastChannel = new BroadcastChannel(BC_NAME);
    broadcastChannel.onmessage = (msg: MessageEvent<AuthTransitionEventV1>) => {
      void ingestAuthEvent(msg.data, true);
    };
  } catch {
    broadcastChannel = null;
  }

  storageListener = (e: StorageEvent) => {
    if (e.key !== STORAGE_FALLBACK || !e.newValue) return;
    try {
      const parsed = JSON.parse(e.newValue) as AuthTransitionEventV1;
      void ingestAuthEvent(parsed, true);
    } catch {
      /* ignore */
    }
  };
  window.addEventListener("storage", storageListener);
  startLeaseHeartbeat();
}

export function startAuthDriftWatcher(authRepository: {
  getSession: () => Promise<{ user?: { id: string } | null }>;
  refreshSessionSingleFlight?: () => Promise<{ error: { message?: string | null } | null }>;
}) {
  if (typeof window === "undefined" || driftTimer) return;
  driftTimer = setInterval(() => {
    void (async () => {
      const h = handlers;
      if (!h) return;
      const { isAuthenticated, userId } = h.getAuthProjection();
      try {
        const { user } = await authRepository.getSession();
        if (isAuthenticated && userId && (!user || user.id !== userId)) {
          emitAuthMetric("session_drift_detected", { userId });
          if (authRepository.refreshSessionSingleFlight) {
            await authRepository.refreshSessionSingleFlight();
            const { user: afterRefresh } = await authRepository.getSession();
            if (afterRefresh?.id === userId) {
              return;
            }
          }
          const originTabId = h.getTabId();
          const ev: AuthTransitionEventV1 = {
            v: 1,
            eventId: crypto.randomUUID(),
            originTabId,
            principalKey: h.getPrincipalKey(),
            type: "BOUNDARY_RESET",
            occurredAt: Date.now(),
            authTraceId: crypto.randomUUID(),
          };
          await runAuthCleanupEvent(ev);
          h.setAuthMachineState("reauth_required");
        }
      } catch {
        /* ignore transient drift check errors */
      }
    })();
  }, 60_000);
}

export function teardownAuthMultiTabSyncForTests() {
  broadcastChannel?.close();
  broadcastChannel = null;
  if (storageListener && typeof window !== "undefined") {
    window.removeEventListener("storage", storageListener);
  }
  storageListener = null;
  if (leaseHeartbeat) clearInterval(leaseHeartbeat);
  leaseHeartbeat = null;
  if (driftTimer) clearInterval(driftTimer);
  driftTimer = null;
  processedEvents.clear();
  cleanupOnceKeys.clear();
}
