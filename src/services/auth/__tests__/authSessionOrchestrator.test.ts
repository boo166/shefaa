import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthMachineState } from "../authStateMachine";

const authHarness = vi.hoisted(() => ({
  calls: [] as string[],
  metrics: [] as Array<{ name: string; payload: Record<string, unknown> }>,
}));

vi.mock("@/services/query/queryClient.instance", () => ({
  queryClient: {
    cancelQueries: vi.fn(async () => {
      authHarness.calls.push("cancelQueries");
    }),
    clear: vi.fn(() => {
      authHarness.calls.push("clear");
    }),
    getQueryCache: vi.fn(() => ({ getAll: () => [] })),
  },
}));

vi.mock("../authAbortRegistry", () => ({
  abortAllAuthBoundary: vi.fn((reason?: string) => {
    authHarness.calls.push(`abort:${reason}`);
  }),
}));

vi.mock("../authMetrics", () => ({
  emitAuthMetric: vi.fn((name: string, payload: Record<string, unknown> = {}) => {
    authHarness.metrics.push({ name, payload });
  }),
}));

import {
  attachAuthSessionOrchestrator,
  broadcastAuthEvent,
  initAuthMultiTabSync,
  purgeCrossPrincipalScopedStorageLeaderOnly,
  runAuthCleanupEvent,
  runPrincipalBoundaryIfNeeded,
  runTenantScopedCacheReset,
  startAuthDriftWatcher,
  teardownAuthMultiTabSyncForTests,
} from "../authSessionOrchestrator";
import { queryClient } from "@/services/query/queryClient.instance";
import { abortAllAuthBoundary } from "../authAbortRegistry";

function attachHandlers(overrides: Partial<{
  principalKey: string;
  parts: { userId: string; tenantId: string };
  machineState: AuthMachineState;
  projection: { isAuthenticated: boolean; userId: string | null };
  reset: () => void | Promise<void>;
  setState: (next: AuthMachineState) => void;
}> = {}) {
  let projection = overrides.projection ?? { isAuthenticated: true, userId: "u1" };
  attachAuthSessionOrchestrator({
    getTabId: () => "tab-a",
    getPrincipalKey: () => overrides.principalKey ?? "u1:tenant-1",
    getPrincipalParts: () => overrides.parts ?? ({ userId: "u1", tenantId: "tenant-1" }),
    resetAuthStores: async () => {
      authHarness.calls.push("resetStores");
      projection = { isAuthenticated: false, userId: null };
      await overrides.reset?.();
    },
    setAuthMachineState: (next) => {
      authHarness.calls.push(`state:${next}`);
      overrides.setState?.(next);
    },
    getAuthMachineState: () => overrides.machineState ?? "authenticated",
    getAuthProjection: () => projection,
  });
}

function event(overrides: Partial<Parameters<typeof runAuthCleanupEvent>[0]> = {}) {
  return {
    v: 1 as const,
    eventId: "evt-1",
    originTabId: "tab-a",
    principalKey: "u1:tenant-1",
    type: "LOGOUT" as const,
    occurredAt: Date.now(),
    authTraceId: "trace-1",
    ...overrides,
  };
}

describe("authSessionOrchestrator", () => {
  beforeEach(() => {
    vi.useRealTimers();
    teardownAuthMultiTabSyncForTests();
    authHarness.calls.length = 0;
    authHarness.metrics.length = 0;
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(queryClient.cancelQueries).mockClear();
    vi.mocked(queryClient.clear).mockClear();
    vi.mocked(abortAllAuthBoundary).mockClear();
    attachHandlers();
  });

  afterEach(() => {
    teardownAuthMultiTabSyncForTests();
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("runs boundary cleanup in deterministic order and clears only the previous tenant scope", async () => {
    localStorage.setItem("lang:tenant-1:u1", "ar");
    localStorage.setItem("calendar:tenant-1:u1", "gregory");
    localStorage.setItem("lang:tenant-2:u1", "en");
    localStorage.setItem("shefaa-cache:tenant-1:u1:patients", "stale");
    localStorage.setItem("shefaa-cache:tenant-2:u2:patients", "current");

    await runAuthCleanupEvent(event());

    expect(authHarness.calls).toEqual([
      "cancelQueries",
      "clear",
      "abort:trace-1",
      "resetStores",
    ]);
    expect(localStorage.getItem("lang:tenant-1:u1")).toBeNull();
    expect(localStorage.getItem("calendar:tenant-1:u1")).toBeNull();
    expect(localStorage.getItem("shefaa-cache:tenant-1:u1:patients")).toBeNull();
    expect(localStorage.getItem("lang:tenant-2:u1")).toBe("en");
    expect(localStorage.getItem("shefaa-cache:tenant-2:u2:patients")).toBe("current");
    expect(authHarness.metrics).toContainEqual({
      name: "cache_cleared",
      payload: { type: "LOGOUT", authTraceId: "trace-1" },
    });
  });

  it("deduplicates identical eventId within the cleanup TTL", async () => {
    const ev = event({ eventId: "evt-dedupe" });

    await runAuthCleanupEvent(ev);
    await runAuthCleanupEvent(ev);

    expect(vi.mocked(queryClient.clear)).toHaveBeenCalledTimes(1);
    expect(authHarness.calls.filter((call) => call === "resetStores")).toHaveLength(1);
  });

  it("rejects stale replay by occurredAt before cleanup can run", async () => {
    await runAuthCleanupEvent(event({
      eventId: "evt-stale",
      occurredAt: Date.now() - 120_000,
      authTraceId: "trace-stale",
    }));

    expect(queryClient.clear).not.toHaveBeenCalled();
    expect(authHarness.metrics.some((metric) => metric.name === "auth_event_replay_rejected")).toBe(true);
  });

  it("ingests storage fallback logout events once and gates duplicate cleanup storms", async () => {
    const states: AuthMachineState[] = [];
    attachHandlers({ setState: (next) => states.push(next) });
    initAuthMultiTabSync();
    const payload = JSON.stringify(event({ eventId: "evt-storage", authTraceId: "trace-storage" }));

    window.dispatchEvent(new StorageEvent("storage", {
      key: "shefaa-auth-sync-fallback",
      newValue: payload,
    }));
    window.dispatchEvent(new StorageEvent("storage", {
      key: "shefaa-auth-sync-fallback",
      newValue: payload,
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["unauthenticated"]);
  });

  it("rejects broadcast/storage cleanup for a mismatched active principal", async () => {
    attachHandlers({ principalKey: "u2:tenant-2" });
    initAuthMultiTabSync();

    window.dispatchEvent(new StorageEvent("storage", {
      key: "shefaa-auth-sync-fallback",
      newValue: JSON.stringify(event({ eventId: "evt-mismatch" })),
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(queryClient.clear).not.toHaveBeenCalled();
    expect(authHarness.metrics).toContainEqual({
      name: "auth_event_replay_rejected",
      payload: { reason: "principal_mismatch" },
    });
  });

  it("broadcasts and clears on sessionVersion changes without a principal change", async () => {
    await runPrincipalBoundaryIfNeeded({
      prevPrincipalKey: "u1:tenant-1",
      nextPrincipalKey: "u1:tenant-1",
      prevSessionVersion: "u1:tenant-1:1",
      nextSessionVersion: "u1:tenant-1:2",
      authTraceId: "trace-version",
    });

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(authHarness.metrics).toContainEqual({
      name: "multi_tab_event",
      payload: { type: "SESSION_VERSION_CHANGED", originTabId: "tab-a" },
    });
  });

  it("does nothing when principal and sessionVersion are unchanged", async () => {
    await runPrincipalBoundaryIfNeeded({
      prevPrincipalKey: "u1:tenant-1",
      nextPrincipalKey: "u1:tenant-1",
      prevSessionVersion: "u1:tenant-1:1",
      nextSessionVersion: "u1:tenant-1:1",
      authTraceId: "trace-same",
    });

    expect(queryClient.clear).not.toHaveBeenCalled();
    expect(authHarness.metrics).toEqual([]);
  });

  it("resets tenant scoped caches without clearing the authenticated projection", async () => {
    localStorage.setItem("lang:tenant-1:u1", "ar");

    await runTenantScopedCacheReset({
      previousPrincipalParts: { userId: "u1", tenantId: "tenant-1" },
      authTraceId: "trace-tenant",
    });

    expect(authHarness.calls).toEqual([
      "cancelQueries",
      "clear",
      "abort:trace-tenant",
    ]);
    expect(localStorage.getItem("lang:tenant-1:u1")).toBeNull();
  });

  it("purges scoped storage keys from other principals while keeping the active scope", () => {
    localStorage.setItem("lang:tenant-1:u1", "ar");
    localStorage.setItem("lang:tenant-2:u1", "en");
    localStorage.setItem("lang:tenant-3:u-other", "fr");
    localStorage.setItem("shefaa-cache:tenant-2:u1:patients", "stale");
    localStorage.setItem("lang:public:anon", "en");

    purgeCrossPrincipalScopedStorageLeaderOnly({ userId: "u1", tenantId: "tenant-2" });

    expect(localStorage.getItem("lang:tenant-1:u1")).toBeNull();
    expect(localStorage.getItem("lang:tenant-2:u1")).toBe("en");
    expect(localStorage.getItem("lang:tenant-3:u-other")).toBeNull();
    expect(localStorage.getItem("shefaa-cache:tenant-2:u1:patients")).toBe("stale");
    expect(localStorage.getItem("lang:public:anon")).toBe("en");
  });

  it("clears all lang preferences on tenant_changed boundary reset", async () => {
    localStorage.setItem("lang:tenant-1:u1", "ar");
    localStorage.setItem("lang:tenant-2:u1", "en");

    await runAuthCleanupEvent(event({ type: "TENANT_CHANGED" }));

    expect(localStorage.getItem("lang:tenant-1:u1")).toBeNull();
    expect(localStorage.getItem("lang:tenant-2:u1")).toBeNull();
  });

  it("broadcastAuthEvent always writes the storage fallback for browsers without BroadcastChannel delivery", () => {
    const setSpy = vi.spyOn(Storage.prototype, "setItem");
    const removeSpy = vi.spyOn(Storage.prototype, "removeItem");

    broadcastAuthEvent(event({ eventId: "evt-broadcast" }));

    expect(setSpy).toHaveBeenCalledWith(
      "shefaa-auth-sync-fallback",
      expect.stringContaining("\"eventId\":\"evt-broadcast\""),
    );
    expect(removeSpy).toHaveBeenCalledWith("shefaa-auth-sync-fallback");
  });

  it("drift watcher refreshes once before forcing a boundary reset", async () => {
    vi.useFakeTimers();
    const states: AuthMachineState[] = [];
    attachHandlers({ setState: (next) => states.push(next) });
    const authRepository = {
      getSession: vi.fn()
        .mockResolvedValueOnce({ user: { id: "different-user" } })
        .mockResolvedValueOnce({ user: { id: "u1" } }),
      refreshSessionSingleFlight: vi.fn(async () => ({ error: null })),
    };

    startAuthDriftWatcher(authRepository);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(authRepository.refreshSessionSingleFlight).toHaveBeenCalledTimes(1);
    expect(queryClient.clear).not.toHaveBeenCalled();
    expect(states).toEqual([]);
    expect(authHarness.metrics).toContainEqual({
      name: "session_drift_detected",
      payload: { userId: "u1" },
    });
  });

  it("drift watcher enters safe mode when refresh cannot restore the expected user", async () => {
    vi.useFakeTimers();
    const states: AuthMachineState[] = [];
    attachHandlers({ setState: (next) => states.push(next) });
    const authRepository = {
      getSession: vi.fn()
        .mockResolvedValueOnce({ user: { id: "different-user" } })
        .mockResolvedValueOnce({ user: { id: "still-different" } }),
      refreshSessionSingleFlight: vi.fn(async () => ({ error: null })),
    };

    startAuthDriftWatcher(authRepository);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["reauth_required"]);
  });
});
