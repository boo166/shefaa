import { beforeEach, describe, expect, it, vi } from "vitest";

const authStoreHarness = vi.hoisted(() => ({
  metrics: [] as Array<{ name: string; payload: Record<string, unknown> }>,
  authHandler: null as null | ((event: string, user?: { id: string; email?: string | null } | null) => void | Promise<void>),
  activeSession: Promise.resolve({ user: null, createdAt: null }) as Promise<any>,
  profile: null as any,
  roles: { tenantRoles: [] as string[], globalRoles: [] as string[] },
  privilegedRefresh: {
    factors: { verified: [] as unknown[] },
    aal: "aal1",
  },
}));

vi.mock("@/services/auth/auth.service", () => ({
  authListenerGuards: { suppressSignedOutCleanup: false },
  authService: {
    getActiveSession: vi.fn(() => authStoreHarness.activeSession),
    loadUserProfile: vi.fn(async () => ({
      profile: authStoreHarness.profile,
      roles: authStoreHarness.roles,
    })),
    getMfaAssuranceLevel: vi.fn(async () => ({ currentLevel: null, nextLevel: null })),
    logout: vi.fn(async () => undefined),
    onAuthStateChange: vi.fn((handler) => {
      authStoreHarness.authHandler = handler;
      return () => undefined;
    }),
  },
}));

vi.mock("@/services/settings/profile.storage", () => ({
  profileStorage: {
    getSignedAvatarUrl: vi.fn(async () => undefined),
  },
}));

vi.mock("@/services/auth/authSessionOrchestrator", () => ({
  attachAuthSessionOrchestrator: vi.fn(),
  broadcastAuthEvent: vi.fn(),
  runAuthCleanupEvent: vi.fn(async () => undefined),
  runPrincipalBoundaryIfNeeded: vi.fn(async () => undefined),
  runTenantScopedCacheReset: vi.fn(async () => undefined),
}));

vi.mock("@/services/auth/authKillSwitch", () => ({
  isAuthKillSwitchActive: vi.fn(() => false),
}));

vi.mock("@/services/auth/authMetrics", () => ({
  emitAuthMetric: vi.fn((name: string, payload: Record<string, unknown> = {}) => {
    authStoreHarness.metrics.push({ name, payload });
  }),
}));

vi.mock("@/services/auth/privilegedSession.service", () => ({
  privilegedSessionService: {
    refreshNow: vi.fn(async () => authStoreHarness.privilegedRefresh),
  },
}));

vi.mock("@/services/auth/sessionVersion", () => ({
  sessionVersionFromSupabaseUser: vi.fn((user, tenantId, createdAt, assurance) => {
    if (!user?.id) return null;
    const tag = assurance === "aal2" ? "2" : assurance === "aal1" ? "1" : "0";
    return `${user.id}:${tenantId ?? "none"}:${createdAt ?? "created"}:${tag}`;
  }),
}));

vi.mock("@/core/auth/portalAuthStore", () => ({
  usePortalAuth: {
    setState: vi.fn(),
  },
}));

async function loadStore() {
  vi.resetModules();
  return import("./authStore");
}

function unresolvedSession(user: { id: string; email?: string | null }) {
  let resolve!: (value: any) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  authStoreHarness.activeSession = promise;
  return {
    resolve: () => resolve({ user, createdAt: "2026-05-08T00:00:00.000Z" }),
  };
}

describe("auth bootstrap barrier", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    authStoreHarness.metrics.length = 0;
    authStoreHarness.authHandler = null;
    authStoreHarness.activeSession = Promise.resolve({ user: null, createdAt: null });
    authStoreHarness.privilegedRefresh = {
      factors: { verified: [] },
      aal: "aal1",
    };
    authStoreHarness.profile = {
      full_name: "Clinic Admin",
      tenant_id: "tenant-1",
      avatar_url: null,
      tenants: { name: "Clinic", slug: "clinic", status: "active", status_reason: null },
    };
    authStoreHarness.roles = { tenantRoles: ["clinic_admin"], globalRoles: [] };
  });

  it("does not expose persisted authenticated state before Supabase resolves", async () => {
    localStorage.setItem(
      "medflow-auth",
      JSON.stringify({
        state: {
          user: { id: "stale-user", tenantId: "tenant-1" },
          isAuthenticated: true,
        },
        version: 1,
      }),
    );
    const gate = unresolvedSession({ id: "u1", email: "user@example.test", email_confirmed_at: "now" } as any);
    const { useAuth } = await loadStore();

    const init = useAuth.getState().initialize();
    expect(useAuth.getState().isAuthenticated).toBe(false);
    expect(useAuth.getState().user).toBeNull();
    expect(useAuth.getState().authMachineState).toBe("initializing");

    gate.resolve();
    await init;

    expect(useAuth.getState().isAuthenticated).toBe(true);
    expect(useAuth.getState().user?.id).toBe("u1");
  });

  it("suppresses listener-driven sign-in transitions until startup resolution completes", async () => {
    const gate = unresolvedSession({ id: "u1", email: "user@example.test", email_confirmed_at: "now" } as any);
    const { useAuth } = await loadStore();

    const init = useAuth.getState().initialize();
    authStoreHarness.authHandler?.("SIGNED_IN", { id: "listener-user", email: "listener@example.test" });
    await Promise.resolve();

    expect(useAuth.getState().isAuthenticated).toBe(false);
    expect(useAuth.getState().user).toBeNull();
    expect(authStoreHarness.metrics).toContainEqual({
      name: "auth_bootstrap_listener_suppressed",
      payload: { event: "SIGNED_IN" },
    });

    gate.resolve();
    await init;

    expect(useAuth.getState().isAuthenticated).toBe(true);
    expect(useAuth.getState().user?.id).toBe("u1");
  });

  it("keeps the MFA gate stable when Supabase replays SIGNED_IN during login", async () => {
    const nextUser = { id: "u2", email: "user2@example.test", email_confirmed_at: "now" } as any;
    authStoreHarness.activeSession = Promise.resolve({
      user: nextUser,
      createdAt: "2026-05-08T00:00:00.000Z",
    });
    authStoreHarness.privilegedRefresh = {
      factors: { verified: [{ id: "factor-1" }] },
      aal: "aal1",
    };
    const { useAuth } = await loadStore();

    await useAuth.getState().initialize();
    useAuth.setState({
      authMachineState: "mfa_required",
      isAuthenticated: true,
      user: {
        id: "old-user",
        name: "Old User",
        email: "old@example.test",
        tenantId: "tenant-1",
        tenantSlug: "clinic",
        tenantName: "Clinic",
        tenantStatus: "active",
        tenantStatusReason: null,
        tenantRoles: ["clinic_admin"],
        globalRoles: [],
      },
    });

    await authStoreHarness.authHandler?.("SIGNED_IN", nextUser);

    expect(useAuth.getState().user?.id).toBe("u2");
    expect(useAuth.getState().authMachineState).toBe("mfa_required");
    expect(useAuth.getState().isLoading).toBe(false);
  });
});
