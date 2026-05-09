import { afterEach, describe, expect, it, vi } from "vitest";

const subscribeMock = vi.fn(() => ({ unsubscribe: vi.fn() }));

vi.mock("@/services/realtime/realtime.repository", () => ({
  realtimeRepository: {
    subscribeToTenantTables: subscribeMock,
  },
}));

vi.mock("@/core/auth/authStore", () => ({
  useAuth: { getState: () => ({ user: { id: "u1", tenantId: "t1", globalRoles: [], tenantRoles: [], tenantStatus: "active" } }) },
  selectEffectiveTenantId: () => "t1",
}));

vi.mock("@/platform/runtime/mode/runtimeModeController", () => ({
  runtimeModeController: {
    getSnapshot: () => ({
      effective: { effectiveMode: "NORMAL", version: 0 },
      global: null,
      tenant: null,
    }),
    subscribe: (fn: () => void) => {
      fn();
      return () => {};
    },
    startAutoRefresh: () => () => {},
    refresh: async () => {},
  },
}));

vi.mock("@/platform/runtime/coordination/runtimeEpochManager", () => ({
  runtimeEpochManager: {
    getCurrentEpoch: () => 0,
    subscribe: (fn: () => void) => {
      fn();
      return () => {};
    },
  },
}));

describe("appointments realtime convergence (registry)", () => {
  afterEach(async () => {
    const rt = await import("@/platform/realtime/realtimeRuntime");
    rt.disconnectAllRegisteredRealtime();
    subscribeMock.mockClear();
  });

  it("registers subscription intent and exposes diagnostics", async () => {
    const { registerRealtimeSubscriptionIntent, getRealtimeRegistryDiagnostics, reconcileAll } = await import(
      "@/platform/realtime/realtimeRuntime",
    );

    const off = registerRealtimeSubscriptionIntent("appointments-test", {
      ctx: { tenantId: "t1", userId: "u1", sessionVersion: "sv1" },
      tables: ["appointments"],
      onEvent: () => {},
    });

    reconcileAll({ force: true });
    await new Promise((r) => setTimeout(r, 150));

    const diag = getRealtimeRegistryDiagnostics();
    expect(diag.intentCount).toBe(1);
    expect(subscribeMock).toHaveBeenCalled();

    off();
    expect(getRealtimeRegistryDiagnostics().intentCount).toBe(0);
  });
});
