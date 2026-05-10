import { create } from "zustand";
import { persist } from "zustand/middleware";
import { profileStorage } from "@/services/settings/profile.storage";
import { authListenerGuards, authService } from "@/services/auth/auth.service";
import { assertAuthTransition, type AuthMachineState } from "@/services/auth/authStateMachine";
import {
  attachAuthSessionOrchestrator,
  broadcastAuthEvent,
  runAuthCleanupEvent,
  runPrincipalBoundaryIfNeeded,
  runTenantScopedCacheReset,
} from "@/services/auth/authSessionOrchestrator";
import { sessionVersionFromSupabaseUser } from "@/services/auth/sessionVersion";
import { isAuthKillSwitchActive } from "@/services/auth/authKillSwitch";
import { emitAuthMetric } from "@/services/auth/authMetrics";
import { usePortalAuth } from "@/core/auth/portalAuthStore";
import type { AuthTransitionEventV1 } from "@/services/auth/authSessionOrchestrator";
import { privilegedSessionService } from "@/services/auth/privilegedSession.service";

export type GlobalRole = "super_admin";
export type TenantRole = "clinic_admin" | "doctor" | "receptionist" | "nurse" | "accountant";
export type Role = GlobalRole | TenantRole;
export type PrivilegedRoleTier = GlobalRole | "clinic_admin";
export type TenantStatus = "active" | "suspended" | "deactivated";
export type AuthenticatorAssuranceLevel = "aal1" | "aal2" | null;

type SupaUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

export type Permission =
  | "manage_clinic" | "manage_users" | "view_dashboard"
  | "manage_patients" | "view_patients"
  | "manage_appointments" | "view_appointments"
  | "manage_medical_records" | "view_medical_records"
  | "manage_billing" | "view_billing"
  | "manage_pharmacy" | "manage_laboratory" | "view_reports"
  | "super_admin";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    "super_admin",
    "manage_clinic", "manage_users", "view_dashboard",
    "manage_patients", "view_patients", "manage_appointments", "view_appointments",
    "manage_medical_records", "view_medical_records",
    "manage_billing", "view_billing",
    "manage_pharmacy", "manage_laboratory", "view_reports",
  ],
  clinic_admin: [
    "manage_clinic", "manage_users", "view_dashboard",
    "manage_patients", "view_patients", "manage_appointments", "view_appointments",
    "manage_medical_records", "view_medical_records",
    "manage_billing", "view_billing",
    "manage_pharmacy", "manage_laboratory", "view_reports",
  ],
  doctor: [
    "view_dashboard", "view_patients", "manage_medical_records", "view_medical_records",
    "view_appointments", "manage_appointments",
  ],
  receptionist: [
    "view_dashboard", "view_patients", "manage_patients",
    "manage_appointments", "view_appointments",
  ],
  nurse: [
    "view_dashboard", "view_patients", "view_medical_records", "view_appointments",
  ],
  accountant: [
    "view_dashboard", "manage_billing", "view_billing", "view_reports",
  ],
};

export interface AppUser {
  id: string;
  name: string;
  email: string;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  tenantStatus: TenantStatus | null;
  tenantRoles: TenantRole[];
  globalRoles: GlobalRole[];
  tenantStatusReason?: string | null;
  avatar?: string;
}

export type TenantOverride = {
  id: string;
  slug: string;
  name: string;
} | null;

export type ImpersonationSession = {
  requestId: string;
  startedAt: string;
  actor: Pick<AppUser, "id" | "name" | "email" | "tenantRoles" | "globalRoles">;
  targetTenant: Exclude<TenantOverride, null>;
} | null;

export type PrivilegedAuthState = {
  currentLevel: AuthenticatorAssuranceLevel;
  nextLevel: AuthenticatorAssuranceLevel;
  verifiedFactorCount: number;
  unverifiedFactorCount: number;
  loadedAt: string | null;
};

export type PrivilegedSession = {
  roleTier: PrivilegedRoleTier | null;
  isPrivileged: boolean;
  aal: AuthenticatorAssuranceLevel;
  isMfaEnrolled: boolean;
  isRecentAuthValid: boolean;
  requiresMfaEnrollment: boolean;
  requiresStepUp: boolean;
  canAccessPrivilegedRoutes: boolean;
};

type PersistedAuthMetadataV1 = {
  version: 1;
  userId: string;
  tenantId: string | null;
  tenantOverride: TenantOverride;
  impersonationSession: ImpersonationSession;
  lastVerifiedAt: string | null;
  sessionVersion: string | null;
  checksum: string;
};

interface AuthState {
  user: AppUser | null;
  supabaseUser: SupaUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authMachineState: AuthMachineState;
  sessionVersion: string | null;
  bootstrapSequenceId: string | null;
  bootstrapCompleted: boolean;
  persistedAuth: PersistedAuthMetadataV1 | null;
  tenantOverride: TenantOverride;
  impersonationSession: ImpersonationSession;
  lastVerifiedAt: string | null;
  privilegedAuth: PrivilegedAuthState;
  setAuthMachineState: (next: AuthMachineState) => void;
  setUser: (user: AppUser | null, supabaseUser?: SupaUser | null) => void;
  setLoading: (loading: boolean) => void;
  setPrivilegedAuth: (state: Partial<PrivilegedAuthState>) => void;
  clearPrivilegedAuth: () => void;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  hasRole: (role: Role) => boolean;
  setTenantOverride: (tenant: TenantOverride) => void;
  /**
   * Apply super-admin tenant override after coordination kernel has cleared caches and frozen writes.
   * Does not clear React Query or publish coordination events — caller owns that.
   */
  applyTenantOverrideAfterCoordination: (tenant: TenantOverride) => void;
  clearTenantOverride: () => void;
  startImpersonation: (tenant: Exclude<TenantOverride, null>, session: Exclude<ImpersonationSession, null>) => void;
  stopImpersonation: () => void;
  markSessionVerified: (verifiedAt?: string) => void;
  initialize: () => Promise<void>;
}

export function isSuperAdmin(user?: Pick<AppUser, "globalRoles"> | null) {
  return Boolean(user?.globalRoles?.includes("super_admin"));
}

export function getPrimaryTenantRole(user?: Pick<AppUser, "tenantRoles"> | null): TenantRole | null {
  return user?.tenantRoles?.[0] ?? null;
}

export function getPrimaryRole(user?: Pick<AppUser, "tenantRoles" | "globalRoles"> | null): Role | null {
  if (isSuperAdmin(user as Pick<AppUser, "globalRoles"> | null)) return "super_admin";
  return getPrimaryTenantRole(user as Pick<AppUser, "tenantRoles"> | null);
}

export function getPrivilegedRoleTier(
  user?: Pick<AppUser, "tenantRoles" | "globalRoles"> | null,
): PrivilegedRoleTier | null {
  if (isSuperAdmin(user as Pick<AppUser, "globalRoles"> | null)) return "super_admin";
  return user?.tenantRoles?.includes("clinic_admin") ? "clinic_admin" : null;
}

function getEffectiveRoles(user?: Pick<AppUser, "tenantRoles" | "globalRoles"> | null): Role[] {
  if (!user) return [];
  return [...(user.globalRoles ?? []), ...(user.tenantRoles ?? [])];
}

export function getDefaultPrivilegedAuthState(): PrivilegedAuthState {
  return {
    currentLevel: null,
    nextLevel: null,
    verifiedFactorCount: 0,
    unverifiedFactorCount: 0,
    loadedAt: null,
  };
}

function assuranceForSessionVersion(aal: { currentLevel: string | null }): AuthenticatorAssuranceLevel {
  const c = aal.currentLevel;
  if (c === "aal1" || c === "aal2") return c;
  return null;
}

function isRecentAuthStillValid(user: AppUser | null, lastVerifiedAt: string | null) {
  if (!user || !lastVerifiedAt) return false;
  const primaryRole = getPrimaryRole(user);
  if (!primaryRole) return false;
  const verifiedAt = new Date(lastVerifiedAt).getTime();
  if (Number.isNaN(verifiedAt)) return false;

  const windowsMs: Record<Role, number> = {
    super_admin: 10 * 60 * 1000,
    clinic_admin: 15 * 60 * 1000,
    doctor: 30 * 60 * 1000,
    receptionist: 30 * 60 * 1000,
    nurse: 30 * 60 * 1000,
    accountant: 30 * 60 * 1000,
  };

  return Date.now() - verifiedAt <= windowsMs[primaryRole];
}

export function buildPrivilegedSession(input: {
  user: AppUser | null;
  lastVerifiedAt: string | null;
  privilegedAuth: PrivilegedAuthState;
}): PrivilegedSession {
  const roleTier = getPrivilegedRoleTier(input.user);
  const isPrivileged = roleTier !== null;
  const isMfaEnrolled = input.privilegedAuth.verifiedFactorCount > 0;
  const aal = input.privilegedAuth.currentLevel;
  const isRecentAuthValid = isRecentAuthStillValid(input.user, input.lastVerifiedAt);
  const requiresMfaEnrollment = isPrivileged && !isMfaEnrolled;
  const canAccessPrivilegedRoutes = !isPrivileged || (isMfaEnrolled && aal === "aal2");

  return {
    roleTier,
    isPrivileged,
    aal,
    isMfaEnrolled,
    isRecentAuthValid,
    requiresMfaEnrollment,
    requiresStepUp: isPrivileged && !isRecentAuthValid,
    canAccessPrivilegedRoutes,
  };
}

let lastPrincipalKeyCommitted: string | null = null;
let lastSessionVersionCommitted: string | null = null;
let startupAuthResolution: Promise<void> | null = null;
let authBootstrapReady = false;

const AUTH_PERSIST_VERSION = 2;

function authChecksum(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function persistedChecksumPayload(input: Omit<PersistedAuthMetadataV1, "checksum">) {
  return JSON.stringify({
    version: input.version,
    userId: input.userId,
    tenantId: input.tenantId,
    tenantOverride: input.tenantOverride,
    impersonationSession: input.impersonationSession,
    lastVerifiedAt: input.lastVerifiedAt,
    sessionVersion: input.sessionVersion,
  });
}

function buildPersistedAuthMetadata(state: AuthState): PersistedAuthMetadataV1 | null {
  if (!state.user) return null;
  const metadata: Omit<PersistedAuthMetadataV1, "checksum"> = {
    version: 1,
    userId: state.user.id,
    tenantId: state.tenantOverride?.id ?? state.user.tenantId ?? null,
    tenantOverride: isSuperAdmin(state.user) ? state.tenantOverride : null,
    impersonationSession: isSuperAdmin(state.user) ? state.impersonationSession : null,
    lastVerifiedAt: state.lastVerifiedAt,
    sessionVersion: state.sessionVersion,
  };
  return {
    ...metadata,
    checksum: authChecksum(persistedChecksumPayload(metadata)),
  };
}

function validatePersistedAuthMetadata(
  persistedAuth: PersistedAuthMetadataV1 | null,
  supaUser: SupaUser,
): PersistedAuthMetadataV1 | null {
  if (!persistedAuth) return null;
  if (persistedAuth.version !== 1) {
    emitAuthMetric("stale_auth_context_rejected", { reason: "version" });
    return null;
  }

  const { checksum, ...withoutChecksum } = persistedAuth;
  if (checksum !== authChecksum(persistedChecksumPayload(withoutChecksum))) {
    emitAuthMetric("stale_auth_context_rejected", { reason: "checksum" });
    return null;
  }

  if (persistedAuth.userId !== supaUser.id) {
    emitAuthMetric("stale_auth_context_rejected", { reason: "principal_mismatch" });
    return null;
  }

  return persistedAuth;
}

function clearAuthenticatedProjection(set: (state: Partial<AuthState>) => void, bootstrapSequenceId?: string) {
  set({
    user: null,
    supabaseUser: null,
    isAuthenticated: false,
    isLoading: true,
    authMachineState: "initializing",
    sessionVersion: null,
    tenantOverride: null,
    impersonationSession: null,
    lastVerifiedAt: null,
    privilegedAuth: getDefaultPrivilegedAuthState(),
    bootstrapSequenceId: bootstrapSequenceId ?? null,
    bootstrapCompleted: false,
  });
}

export function principalKeyFromSnapshot(state: Pick<AuthState, "user" | "tenantOverride">) {
  const u = state.user;
  if (!u) return "anon:none";
  const tid = state.tenantOverride?.id ?? u.tenantId ?? "none";
  return `${u.id}:${tid}`;
}

/** Tenant id for tenant-scoped modules (React Query keys, `enabled`). Matches {@link getTenantContext} when APIs are allowed. */
export function selectEffectiveTenantId(state: Pick<AuthState, "user" | "tenantOverride">): string | null {
  const { user, tenantOverride } = state;
  if (!user?.id) return null;
  if (user.globalRoles.includes("super_admin")) return tenantOverride?.id ?? null;
  return user.tenantId ?? null;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      supabaseUser: null,
      isAuthenticated: false,
      isLoading: true,
      authMachineState: "initializing",
      sessionVersion: null,
      bootstrapSequenceId: null,
      bootstrapCompleted: false,
      persistedAuth: null,
      tenantOverride: null,
      impersonationSession: null,
      lastVerifiedAt: null,
      privilegedAuth: getDefaultPrivilegedAuthState(),
      setAuthMachineState: (next) => {
        const prev = get().authMachineState;
        assertAuthTransition(prev, next);
        const loading =
          next === "initializing"
          || next === "authenticating"
          || next === "unauthenticated_pending_cleanup"
          || next === "refreshing";
        set({ authMachineState: next, isLoading: loading });
      },
      setUser: (user, supabaseUser) => {
        if (user && !authBootstrapReady) {
          emitAuthMetric("stale_auth_context_rejected", { reason: "bootstrap_not_ready" });
          return;
        }
        set({
          user,
          supabaseUser: supabaseUser ?? null,
          isAuthenticated: !!user,
          isLoading: false,
          authMachineState: user ? "authenticated" : "unauthenticated",
          tenantOverride: isSuperAdmin(user) ? get().tenantOverride : null,
          impersonationSession: isSuperAdmin(user) ? get().impersonationSession : null,
          lastVerifiedAt: user ? get().lastVerifiedAt : null,
          sessionVersion: user ? get().sessionVersion : null,
        });
      },
      setLoading: (isLoading) => set({ isLoading }),
      setPrivilegedAuth: (state) => set((current) => ({
        privilegedAuth: {
          ...current.privilegedAuth,
          ...state,
        },
      })),
      clearPrivilegedAuth: () => set({ privilegedAuth: getDefaultPrivilegedAuthState() }),
      logout: async () => {
        const trace = crypto.randomUUID();
        const principalKey = principalKeyFromSnapshot(get());
        get().setAuthMachineState("unauthenticated_pending_cleanup");
        try {
          await authService.logout(trace, principalKey);
        } finally {
          lastPrincipalKeyCommitted = null;
          lastSessionVersionCommitted = null;
          get().setAuthMachineState("unauthenticated");
        }
      },
      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        return getEffectiveRoles(user).some((role) => ROLE_PERMISSIONS[role]?.includes(permission) ?? false);
      },
      hasRole: (role) => {
        const user = get().user;
        if (!user) return false;
        return role === "super_admin"
          ? isSuperAdmin(user)
          : user.tenantRoles.includes(role as TenantRole);
      },
      setTenantOverride: (tenant) => {
        const s = get();
        if (s.isAuthenticated && s.user && isSuperAdmin(s.user)) {
          void import("@/platform/runtime/coordination/transitions/tenantSwitch").then((m) =>
            m.switchTenantAsync({ tenant, authTraceId: crypto.randomUUID() }).catch(() => {
              emitAuthMetric("stale_auth_context_rejected", { reason: "tenant_switch_failed" });
            }),
          );
          return;
        }
        const prevParts = {
          userId: get().user?.id ?? "anon",
          tenantId: get().tenantOverride?.id ?? get().user?.tenantId ?? "none",
        };
        set({
          tenantOverride: tenant,
          impersonationSession: null,
        });
        const u = get().supabaseUser;
        const effTenant = tenant?.id ?? get().user?.tenantId ?? null;
        const privAal = get().privilegedAuth.currentLevel;
        const nextVer = sessionVersionFromSupabaseUser(u as any, effTenant, null, privAal);
        const nextKey = principalKeyFromSnapshot(get());
        if (get().isAuthenticated && prevParts.userId !== "anon") {
          void runTenantScopedCacheReset({
            previousPrincipalParts: prevParts,
            authTraceId: crypto.randomUUID(),
          });
        }
        if (nextVer) {
          set({ sessionVersion: nextVer });
          lastPrincipalKeyCommitted = nextKey;
          lastSessionVersionCommitted = nextVer;
        }
        const effAfter = tenant?.id ?? get().user?.tenantId ?? null;
        void import("@/platform/runtime/coordination/notifyAuthAndTenant").then((m) =>
          m.notifyTenantContextChanged({ tenantId: effAfter, actorId: get().user?.id }),
        );
      },
      applyTenantOverrideAfterCoordination: (tenant) => {
        set({
          tenantOverride: tenant,
          impersonationSession: null,
        });
        const u = get().supabaseUser;
        const effTenant = tenant?.id ?? get().user?.tenantId ?? null;
        const privAal = get().privilegedAuth.currentLevel;
        const nextVer = sessionVersionFromSupabaseUser(u as any, effTenant, null, privAal);
        const nextKey = principalKeyFromSnapshot(get());
        if (nextVer) {
          set({ sessionVersion: nextVer });
          lastPrincipalKeyCommitted = nextKey;
          lastSessionVersionCommitted = nextVer;
        }
      },
      clearTenantOverride: () => {
        set({ tenantOverride: null, impersonationSession: null });
      },
      startImpersonation: (tenant, session) => {
        set({ tenantOverride: tenant, impersonationSession: session });
      },
      stopImpersonation: () => {
        set({ tenantOverride: null, impersonationSession: null });
      },
      markSessionVerified: (verifiedAt) => {
        set({ lastVerifiedAt: verifiedAt ?? new Date().toISOString() });
      },
      initialize: async () => {
        if (startupAuthResolution) return startupAuthResolution;

        authBootstrapReady = false;
        const bootstrapSequenceId = crypto.randomUUID();
        const bootstrapStartedAt = Date.now();
        startupAuthResolution = (async () => {
          clearAuthenticatedProjection(set, bootstrapSequenceId);
          await Promise.resolve((useAuth as any).persist?.rehydrate?.()).catch(() => {
            emitAuthMetric("stale_auth_context_rejected", { reason: "hydrate_failed" });
          });
          clearAuthenticatedProjection(set, bootstrapSequenceId);

          if (isAuthKillSwitchActive()) {
            emitAuthMetric("auth_kill_switch_activated", {});
            const trace = crypto.randomUUID();
            const pk = principalKeyFromSnapshot(get());
            const tabId = (() => {
              try {
                let id = sessionStorage.getItem("shefaa_tab_id");
                if (!id) {
                  id = crypto.randomUUID();
                  sessionStorage.setItem("shefaa_tab_id", id);
                }
                return id;
              } catch {
                return "tab";
              }
            })();
            const ev: AuthTransitionEventV1 = {
              v: 1,
              eventId: crypto.randomUUID(),
              originTabId: tabId,
              principalKey: pk,
              type: "BOUNDARY_RESET",
              occurredAt: Date.now(),
              authTraceId: trace,
            };
            await runAuthCleanupEvent(ev);
            set({ bootstrapCompleted: true });
            emitAuthMetric("auth_bootstrap_completed", {
              result: "kill_switch",
              durationMs: Date.now() - bootstrapStartedAt,
              bootstrapSequenceId,
            });
            get().setAuthMachineState("reauth_required");
            return;
          }

          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Auth timeout")), 8000)
          );
          try {
            const active = await Promise.race([authService.getActiveSession(), timeout]);
            const supaUser = active.user as SupaUser | null;
            if (supaUser) {
              const persistedAuth = validatePersistedAuthMetadata(get().persistedAuth, supaUser);
              if (get().persistedAuth && !persistedAuth) {
                set({ persistedAuth: null });
              }
              await Promise.race([
                loadUserProfile(supaUser, {
                  createdAt: active.createdAt ?? null,
                  persistedAuth,
                }),
                timeout,
              ]);
              const { user, lastVerifiedAt } = get();
              if (!user || !isSuperAdmin(user)) {
                set({ tenantOverride: null, impersonationSession: null });
              }
              if (user && !lastVerifiedAt) {
                set({ lastVerifiedAt: new Date().toISOString() });
              }
              emitAuthMetric("auth_bootstrap_completed", {
                result: user ? "session_restored" : "profile_rejected",
                durationMs: Date.now() - bootstrapStartedAt,
                bootstrapSequenceId,
              });
            } else {
              lastPrincipalKeyCommitted = null;
              lastSessionVersionCommitted = null;
              set({
                user: null,
                supabaseUser: null,
                isAuthenticated: false,
                tenantOverride: null,
                impersonationSession: null,
                lastVerifiedAt: null,
                privilegedAuth: getDefaultPrivilegedAuthState(),
                sessionVersion: null,
                persistedAuth: null,
              });
              get().setAuthMachineState("unauthenticated");
              emitAuthMetric("auth_bootstrap_completed", {
                result: "no_session",
                durationMs: Date.now() - bootstrapStartedAt,
                bootstrapSequenceId,
              });
            }
          } catch {
            lastPrincipalKeyCommitted = null;
            lastSessionVersionCommitted = null;
            set({
              user: null,
              supabaseUser: null,
              isAuthenticated: false,
              tenantOverride: null,
              impersonationSession: null,
              lastVerifiedAt: null,
              privilegedAuth: getDefaultPrivilegedAuthState(),
              sessionVersion: null,
              persistedAuth: null,
            });
            get().setAuthMachineState("unauthenticated");
            emitAuthMetric("auth_bootstrap_completed", {
              result: "failure",
              durationMs: Date.now() - bootstrapStartedAt,
              bootstrapSequenceId,
            });
          } finally {
            set({ bootstrapCompleted: true });
          }
        })().finally(() => {
          authBootstrapReady = true;
          startupAuthResolution = null;
        });

        return startupAuthResolution;
      },
    }),
    {
      name: "medflow-auth",
      version: AUTH_PERSIST_VERSION,
      skipHydration: true,
      migrate: () => ({
        persistedAuth: null,
      }),
      partialize: (state) => ({
        persistedAuth: buildPersistedAuthMetadata(state),
      }),
    }
  )
);

async function loadUserProfile(
  supaUser: SupaUser,
  sessionMeta?: { createdAt?: string | null; persistedAuth?: PersistedAuthMetadataV1 | null },
) {
  const isVerified = Boolean(supaUser.email_confirmed_at ?? supaUser.confirmed_at);
  if (!isVerified) {
    await authService.logout(undefined, principalKeyFromSnapshot(useAuth.getState())).catch(() => undefined);
    useAuth.setState({
      user: null,
      supabaseUser: null,
      isAuthenticated: false,
      sessionVersion: null,
      authMachineState: "unauthenticated",
    });
    return;
  }
  const { profile, roles } = await authService.loadUserProfile(supaUser.id);
  const hasAnyRole = roles.globalRoles.length > 0 || roles.tenantRoles.length > 0;
  if (profile && hasAnyRole) {
    const tenant = profile.tenants as any;
    const superAdmin = roles.globalRoles.includes("super_admin");
    const nextUser: AppUser = {
      id: supaUser.id,
      name: profile.full_name,
      email: supaUser.email ?? "",
      tenantId: profile.tenant_id ?? null,
      tenantSlug: tenant?.slug ?? (superAdmin ? null : "default"),
      tenantName: tenant?.name ?? (superAdmin ? null : "Clinic"),
      tenantStatus: tenant?.status ?? (superAdmin ? null : "active"),
      tenantRoles: roles.tenantRoles as TenantRole[],
      globalRoles: roles.globalRoles as GlobalRole[],
      tenantStatusReason: tenant?.status_reason ?? null,
      avatar: undefined,
    };
    let avatarUrl: string | undefined = profile.avatar_url ?? undefined;

    if (avatarUrl && !avatarUrl.startsWith("http")) {
      try {
        avatarUrl = await profileStorage.getSignedAvatarUrl(avatarUrl);
      } catch {
        avatarUrl = undefined;
      }
    }

    nextUser.avatar = avatarUrl;

    const tenantOverride = isSuperAdmin(nextUser)
      ? sessionMeta?.persistedAuth?.tenantOverride ?? useAuth.getState().tenantOverride
      : null;
    const effTenant = tenantOverride?.id ?? nextUser.tenantId ?? null;
    const nextKey = principalKeyFromSnapshot({ user: nextUser, tenantOverride });
    let assuranceLevel: AuthenticatorAssuranceLevel = null;
    try {
      const aal = await authService.getMfaAssuranceLevel();
      assuranceLevel = assuranceForSessionVersion(aal);
    } catch {
      assuranceLevel = null;
    }
    const nextVer = sessionVersionFromSupabaseUser(
      supaUser as any,
      effTenant,
      sessionMeta?.createdAt ?? null,
      assuranceLevel,
    );

    if (nextVer && lastPrincipalKeyCommitted) {
      await runPrincipalBoundaryIfNeeded({
        prevPrincipalKey: lastPrincipalKeyCommitted,
        nextPrincipalKey: nextKey,
        prevSessionVersion: lastSessionVersionCommitted,
        nextSessionVersion: nextVer,
        authTraceId: crypto.randomUUID(),
      });
    }
    if (nextVer) {
      lastPrincipalKeyCommitted = nextKey;
      lastSessionVersionCommitted = nextVer;
    }

    useAuth.setState({
      user: nextUser,
      supabaseUser: supaUser,
      isAuthenticated: true,
      tenantOverride,
      impersonationSession: isSuperAdmin(nextUser)
        ? sessionMeta?.persistedAuth?.impersonationSession ?? useAuth.getState().impersonationSession
        : null,
      lastVerifiedAt: sessionMeta?.persistedAuth?.lastVerifiedAt ?? useAuth.getState().lastVerifiedAt,
      sessionVersion: nextVer,
      authMachineState: "authenticated",
      isLoading: false,
    });
  } else {
    lastPrincipalKeyCommitted = null;
    lastSessionVersionCommitted = null;
    useAuth.setState({
      user: null,
      supabaseUser: null,
      isAuthenticated: false,
      tenantOverride: null,
      impersonationSession: null,
      lastVerifiedAt: null,
      privilegedAuth: getDefaultPrivilegedAuthState(),
      sessionVersion: null,
      authMachineState: "unauthenticated",
    });
  }
}

let tokenRefreshCoalesce: ReturnType<typeof setTimeout> | null = null;

function readTabIdForEvent() {
  if (typeof sessionStorage === "undefined") return "ssr";
  try {
    let id = sessionStorage.getItem("shefaa_tab_id");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("shefaa_tab_id", id);
    }
    return id;
  } catch {
    return "tab";
  }
}

// Listen for auth changes
authService.onAuthStateChange(async (event, sessionUser) => {
  const { setLoading, markSessionVerified, setAuthMachineState } = useAuth.getState();

  if (!authBootstrapReady) {
    emitAuthMetric("auth_bootstrap_listener_suppressed", { event });
    return;
  }

  if (event === "TOKEN_REFRESHED") {
    if (tokenRefreshCoalesce) clearTimeout(tokenRefreshCoalesce);
    tokenRefreshCoalesce = setTimeout(() => {
      tokenRefreshCoalesce = null;
      void (async () => {
        const active = await authService.getActiveSession();
        const effTenant = useAuth.getState().tenantOverride?.id ?? useAuth.getState().user?.tenantId ?? null;
        let assuranceLevel: AuthenticatorAssuranceLevel = null;
        try {
          const aal = await authService.getMfaAssuranceLevel();
          assuranceLevel = assuranceForSessionVersion(aal);
        } catch {
          assuranceLevel = null;
        }
        const nextVer = sessionVersionFromSupabaseUser(
          active.user as any,
          effTenant,
          active.createdAt ?? null,
          assuranceLevel,
        );
        if (nextVer) {
          useAuth.setState({ sessionVersion: nextVer });
        }
      })();
    }, 150);
    return;
  }

  if (event === "SIGNED_IN" && sessionUser) {
    setLoading(true);
    const currentAuthState = useAuth.getState().authMachineState;
    if (currentAuthState !== "mfa_required" && currentAuthState !== "mfa_verifying") {
      setAuthMachineState("authenticating");
    }
    const active = await authService.getActiveSession();
    await loadUserProfile(sessionUser as SupaUser, { createdAt: active.createdAt ?? null });
    markSessionVerified();
    try {
      const refreshed = await privilegedSessionService.refreshNow();
      const hasVerifiedFactor = refreshed.factors.verified.length > 0;
      const isAal2 = refreshed.aal === "aal2";
      if (hasVerifiedFactor && !isAal2) {
        emitAuthMetric("mfa_challenge_required", { reason: "login" });
        setAuthMachineState("mfa_required");
      }
    } catch {
      // Best-effort: if we can't determine MFA status, don't block login.
    }
    setLoading(false);
  } else if (event === "SIGNED_OUT") {
    if (authListenerGuards.suppressSignedOutCleanup) {
      lastPrincipalKeyCommitted = null;
      lastSessionVersionCommitted = null;
      setAuthMachineState("unauthenticated");
      return;
    }
    const pk = principalKeyFromSnapshot(useAuth.getState());
    const trace = crypto.randomUUID();
    const ev: AuthTransitionEventV1 = {
      v: 1,
      eventId: crypto.randomUUID(),
      originTabId: readTabIdForEvent(),
      principalKey: pk,
      type: "SIGNED_OUT",
      occurredAt: Date.now(),
      authTraceId: trace,
    };
    await runAuthCleanupEvent(ev);
    broadcastAuthEvent(ev);
    lastPrincipalKeyCommitted = null;
    lastSessionVersionCommitted = null;
    setAuthMachineState("unauthenticated");
  }
});

attachAuthSessionOrchestrator({
  getTabId: readTabIdForEvent,
  getPrincipalKey: () => principalKeyFromSnapshot(useAuth.getState()),
  getPrincipalParts: () => {
    const u = useAuth.getState().user;
    const tid = useAuth.getState().tenantOverride?.id ?? u?.tenantId ?? "none";
    const uid = u?.id ?? "anon";
    return { userId: uid, tenantId: tid };
  },
  resetAuthStores: async () => {
    usePortalAuth.setState({ user: null, supabaseUser: null, isAuthenticated: false, isLoading: false });
    useAuth.setState((s) => ({
      ...s,
      user: null,
      supabaseUser: null,
      isAuthenticated: false,
      tenantOverride: null,
      impersonationSession: null,
      lastVerifiedAt: null,
      privilegedAuth: getDefaultPrivilegedAuthState(),
      sessionVersion: null,
    }));
    try {
      await (useAuth as any).persist?.clearStorage?.();
    } catch {
      /* best-effort persisted auth cleanup */
    }
  },
  setAuthMachineState: (next) => useAuth.getState().setAuthMachineState(next),
  getAuthMachineState: () => useAuth.getState().authMachineState,
  getAuthProjection: () => {
    const { isAuthenticated, user } = useAuth.getState();
    return { isAuthenticated, userId: user?.id ?? null };
  },
});
