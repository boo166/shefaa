import { z } from "zod";
import { AuthorizationError, ServiceError, toServiceError } from "@/services/supabase/errors";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import { authRepository, isTransientAuthNetworkError } from "./auth.repository";
import { env } from "@/core/env/env";
import { rateLimitService } from "@/services/security/rateLimit.service";
import { emitAuthMetric } from "./authMetrics";
import { identityAuditService } from "./identityAudit.service";
import { isAuthKillSwitchActive } from "./authKillSwitch";
import {
  broadcastAuthEvent,
  runAuthCleanupEvent,
  type AuthTransitionEventV1,
} from "./authSessionOrchestrator";
import { awaitRecoveryWithBackpressure, isAuthRecoveryInProgress, runAuthRecovery } from "./authRecovery";
import { getPreemptiveRefreshThresholdSec } from "@/services/supabase/supabaseAuthFetch";
import { useAuth } from "@/core/auth/authStore";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** When true, `onAuthStateChange(SIGNED_OUT)` cleanup is handled by `logout()` finally (avoids double boundary reset). */
export const authListenerGuards = {
  suppressSignedOutCleanup: false,
  /** When true, password re-auth must not redirect the app to /mfa (inline challenge handles MFA). */
  suppressMfaRequiredDuringReauth: false,
};

let unauthorizedWindowStart = Date.now();
let unauthorizedCount = 0;

function noteUnauthorizedTriggerInternal() {
  const now = Date.now();
  if (now - unauthorizedWindowStart > 60_000) {
    unauthorizedWindowStart = now;
    unauthorizedCount = 0;
  }
  unauthorizedCount++;
  if (unauthorizedCount > 10) {
    emitAuthMetric("unexpected_logout", { reason: "unauthorized_storm" });
    throw new ServiceError("Too many unauthorized recovery attempts", { code: "RATE_LIMITED" });
  }
}

function isInvalidRefreshTokenMessage(message: string) {
  const m = message.toLowerCase();
  return m.includes("invalid refresh token") || m.includes("refresh token not found");
}

async function runRefreshWithRetriesInternal(authTraceId: string) {
  if (isAuthKillSwitchActive()) {
    emitAuthMetric("auth_kill_switch_activated", { authTraceId });
    throw new ServiceError("Authentication unavailable", { code: "AUTH_KILL_SWITCH" });
  }
  const delays = [500, 1000, 2000];
  for (let attempt = 0; attempt < 3; attempt++) {
    emitAuthMetric("refresh_attempt", { attempt, authTraceId });
    const { error } = await authRepository.refreshSessionSingleFlight();
    if (!error) {
      emitAuthMetric("refresh_succeeded", { attempt, authTraceId });
      return;
    }
    const msg = error.message ?? "";
    if (isInvalidRefreshTokenMessage(msg)) {
      emitAuthMetric("refresh_failed", { terminal: true, authTraceId });
      throw new ServiceError("Refresh failed", { code: "REFRESH_FAILED" });
    }
    if (!isTransientAuthNetworkError(error)) {
      emitAuthMetric("refresh_failed", { terminal: true, authTraceId });
      throw new ServiceError("Refresh failed", { code: "REFRESH_FAILED" });
    }
    await sleep(delays[attempt] ?? 2000);
  }
  emitAuthMetric("refresh_failed", { terminal: true, authTraceId });
  throw new ServiceError("Refresh failed", { code: "REFRESH_FAILED" });
}

const emailSchema = z.string().trim().email();
const passwordSchema = z.string().min(12).max(128);
const nonEmptySchema = z.string().trim().min(2).max(120);
const slugSchema = z.string().trim().min(2).max(60);

export const authService = {
  noteUnauthorizedTrigger: noteUnauthorizedTriggerInternal,

  async getActiveSession() {
    try {
      const s = await authRepository.getSession();
      return {
        user: s.user ?? null,
        expiresAt: s.expiresAt,
        createdAt: s.createdAt ?? null,
      };
    } catch (err) {
      throw toServiceError(err, "Failed to load session");
    }
  },

  async ensureFreshSessionIfNeeded(thresholdSec?: number) {
    if (isAuthKillSwitchActive()) {
      emitAuthMetric("auth_kill_switch_activated", {});
      return;
    }
    const threshold = thresholdSec ?? getPreemptiveRefreshThresholdSec();
    const { expiresAt } = await authRepository.getSession();
    if (!expiresAt) return;
    const now = Date.now() / 1000;
    if (expiresAt - now > threshold) return;
    emitAuthMetric("refresh_attempt", { phase: "preemptive" });
    const { error } = await authRepository.refreshSessionSingleFlight();
    if (error) {
      emitAuthMetric("refresh_failed", { phase: "preemptive" });
    } else {
      emitAuthMetric("refresh_succeeded", { phase: "preemptive" });
    }
  },

  async login(email: string, password: string) {
    let parsedEmail = "";
    try {
      if (isAuthKillSwitchActive()) {
        emitAuthMetric("auth_kill_switch_activated", {});
        throw new AuthorizationError("Authentication is temporarily unavailable.");
      }
      parsedEmail = emailSchema.parse(email);
      const parsedPassword = z.string().min(1).parse(password);
      await rateLimitService.assertAllowed("login", [parsedEmail]);
      const user = await authRepository.signInWithPassword(parsedEmail, parsedPassword);
      const userConfirmedAt = (user as { email_confirmed_at?: string | null; confirmed_at?: string | null } | null) ?? null;
      const isVerified = Boolean(userConfirmedAt?.email_confirmed_at ?? userConfirmedAt?.confirmed_at);
      if (user && !isVerified) {
        await Promise.resolve(authRepository.signOut()).catch(() => undefined);
        throw new AuthorizationError("Please verify your email before logging in.");
      }
      if (user) {
        const { profile, roles } = await authService.loadUserProfile(user.id);
        const hasAnyRole = roles.globalRoles.length > 0 || roles.tenantRoles.length > 0;
        const accountStatus = (profile as { account_status?: string } | null)?.account_status ?? "active";
        if (!profile || !hasAnyRole) {
          await Promise.resolve(authRepository.signOut()).catch(() => undefined);
          throw new AuthorizationError("This clinic is suspended or deactivated.");
        }
        if (accountStatus === "suspended") {
          await Promise.resolve(authRepository.signOut()).catch(() => undefined);
          throw new AuthorizationError("Your account has been suspended.");
        }
        emitAuthMetric("login_succeeded", { userId: user.id });
        identityAuditService.logAction("LOGIN_SUCCESS", {
          userId: user.id,
          tenantId: (profile as { tenant_id?: string }).tenant_id ?? null,
          actorUserId: user.id,
          entityId: user.id,
        });
      }
    } catch (err) {
      emitAuthMetric("login_failed", {
        errorCode: err instanceof Error ? err.message : "unknown",
      });
      identityAuditService.logAction("LOGIN_FAILED", {
        details: parsedEmail ? { email: parsedEmail } : undefined,
      });
      throw toServiceError(err, "Login failed");
    }
  },
  async handleUnauthorized(params: { source: string; endpoint: string; authTraceId: string }) {
    noteUnauthorizedTriggerInternal();
    if (isAuthKillSwitchActive()) {
      emitAuthMetric("auth_kill_switch_activated", { authTraceId: params.authTraceId });
      try {
        useAuth.getState().setAuthMachineState("reauth_required");
      } catch {
        /* ignore */
      }
      throw new ServiceError("Authentication unavailable", { code: "AUTH_KILL_SWITCH" });
    }

    if (isAuthRecoveryInProgress()) {
      await awaitRecoveryWithBackpressure();
      return;
    }

    try {
      await runAuthRecovery(async () => {
        await runRefreshWithRetriesInternal(params.authTraceId);
      });
    } catch (e) {
      if (e instanceof ServiceError && (e.code === "RATE_LIMITED" || e.code === "AUTH_KILL_SWITCH")) throw e;
      try {
        useAuth.getState().setAuthMachineState("reauth_required");
      } catch {
        /* ignore */
      }
    }
  },

  async handleForbidden(params: { source: string; endpoint: string; authTraceId: string }) {
    emitAuthMetric("authorization_denied", {
      source: params.source,
      endpoint: params.endpoint,
      authTraceId: params.authTraceId,
    });

    if (isAuthKillSwitchActive()) {
      emitAuthMetric("auth_kill_switch_activated", { authTraceId: params.authTraceId });
      try {
        useAuth.getState().setAuthMachineState("reauth_required");
      } catch {
        /* ignore */
      }
      throw new ServiceError("Authentication unavailable", { code: "AUTH_KILL_SWITCH" });
    }
  },

  async logout(authTraceId?: string, principalKey?: string) {
    authListenerGuards.suppressSignedOutCleanup = true;
    const trace = authTraceId ?? crypto.randomUUID();
    const tabId = (() => {
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
    })();
    const session = await authRepository.getSession().catch(() => ({ user: null as SupabaseUser | null }));
    const u = session.user;
    if (u?.id) {
      const profile = await authRepository.getProfileByUserId(u.id).catch(() => null);
      identityAuditService.logAction("LOGOUT", {
        userId: u.id,
        tenantId: (profile as { tenant_id?: string } | null)?.tenant_id ?? null,
        actorUserId: u.id,
        entityId: u.id,
        requestTraceId: trace,
      });
    }
    const principalKeyResolved = principalKey ?? (u?.id ? `${u.id}:none` : "anon:none");
    const event: AuthTransitionEventV1 = {
      v: 1,
      eventId: crypto.randomUUID(),
      originTabId: tabId,
      principalKey: principalKeyResolved,
      type: "LOGOUT",
      occurredAt: Date.now(),
      authTraceId: trace,
    };
    try {
      try {
        await authRepository.signOut({ scope: "global" });
      } catch {
        await authRepository.signOut({ scope: "local" }).catch(() => undefined);
      }
    } finally {
      await runAuthCleanupEvent(event);
      broadcastAuthEvent(event);
      authListenerGuards.suppressSignedOutCleanup = false;
    }
  },

  async refreshSessionWithRetryPolicy(authTraceId: string) {
    if (isAuthKillSwitchActive()) {
      emitAuthMetric("auth_kill_switch_activated", { authTraceId });
      return { ok: false as const, code: "AUTH_KILL_SWITCH" as const };
    }
    try {
      await runAuthRecovery(async () => {
        await runRefreshWithRetriesInternal(authTraceId);
      });
      return { ok: true as const };
    } catch (e) {
      if (e instanceof Error && e.message === "RECOVERY_TIMEOUT") {
        emitAuthMetric("auth_recovery_failed", { reason: "timeout", authTraceId });
        return { ok: false as const, code: "RECOVERY_TIMEOUT" as const };
      }
      return { ok: false as const, code: "REFRESH_FAILED" as const };
    }
  },

  async getSessionUser() {
    try {
      if (isAuthKillSwitchActive()) {
        emitAuthMetric("auth_kill_switch_activated", {});
        return null;
      }
      const result = await authRepository.getSession();
      return result.user ?? null;
    } catch (err) {
      throw toServiceError(err, "Failed to load session");
    }
  },
  onAuthStateChange(handler: (event: string, user?: { id: string; email?: string | null } | null) => void) {
    return authRepository.onAuthStateChange(handler);
  },
  async resetPassword(email: string, redirectTo: string) {
    try {
      const parsedEmail = emailSchema.parse(email);
      await rateLimitService.assertAllowed("password_reset", [parsedEmail]);
      await authRepository.resetPasswordForEmail(parsedEmail, redirectTo);
      identityAuditService.logAction("PASSWORD_RESET_REQUESTED", {
        details: { email_domain: parsedEmail.includes("@") ? parsedEmail.split("@")[1] : undefined },
      });
    } catch (err) {
      throw toServiceError(err, "Failed to send reset email");
    }
  },
  async updatePassword(password: string) {
    try {
      const parsedPassword = passwordSchema.parse(password);
      const session = await authRepository.getSession();
      await authRepository.updatePassword(parsedPassword);
      const userId = session.user?.id;
      if (userId) {
        const profile = await authRepository.getProfileByUserId(userId).catch(() => null);
        identityAuditService.logAction("PASSWORD_RESET_COMPLETED", {
          userId,
          tenantId: (profile as { tenant_id?: string } | null)?.tenant_id ?? null,
          actorUserId: userId,
          entityId: userId,
        });
      }
    } catch (err) {
      throw toServiceError(err, "Failed to update password");
    }
  },
  async loadUserProfile(userId: string) {
    try {
      const parsedUserId = uuidSchema.parse(userId);
      const profile = await authRepository.getProfileByUserId(parsedUserId);
      const roles = await authRepository.getRolesByUserId(parsedUserId);
      return { profile, roles };
    } catch (err) {
      throw toServiceError(err, "Failed to load user profile");
    }
  },
  async getMfaAssuranceLevel() {
    try {
      return await authRepository.getMfaAssuranceLevel();
    } catch (err) {
      throw toServiceError(err, "Failed to load MFA assurance level");
    }
  },
  async listMfaFactors() {
    try {
      return await authRepository.listMfaFactors();
    } catch (err) {
      throw toServiceError(err, "Failed to load MFA factors");
    }
  },
  async enrollTotpFactor(input?: { friendlyName?: string; issuer?: string }) {
    try {
      return await authRepository.enrollTotpFactor(input);
    } catch (err) {
      throw toServiceError(err, "Failed to enroll MFA factor");
    }
  },
  async verifyTotpFactor(input: { factorId: string; code: string }) {
    try {
      const factorId = uuidSchema.parse(input.factorId);
      const code = z.string().trim().min(6).max(8).parse(input.code);
      const challenge = await authRepository.challengeMfaFactor(factorId);
      await authRepository.verifyTotpFactor({
        factorId,
        challengeId: challenge.id,
        code,
      });
    } catch (err) {
      throw toServiceError(err, "Failed to verify MFA factor");
    }
  },
  async removeMfaFactor(factorId: string) {
    try {
      const parsedFactorId = uuidSchema.parse(factorId);
      await authRepository.unenrollMfaFactor(parsedFactorId);
    } catch (err) {
      throw toServiceError(err, "Failed to remove MFA factor");
    }
  },
  async generateMfaRecoveryCodes(count = 10) {
    try {
      const parsedCount = z.number().int().min(8).max(20).parse(count);
      const codes = await authRepository.generateMfaRecoveryCodes(parsedCount);
      emitAuthMetric("recovery_codes_generated", { count: codes.length });
      return codes;
    } catch (err) {
      throw toServiceError(err, "Failed to generate recovery codes");
    }
  },
  async consumeMfaRecoveryCode(code: string) {
    try {
      const trimmed = z.string().trim().min(8).max(64).parse(code);
      const ok = await authRepository.consumeMfaRecoveryCode(trimmed);
      if (ok) emitAuthMetric("recovery_code_used", {});
      return ok;
    } catch (err) {
      throw toServiceError(err, "Failed to use recovery code");
    }
  },
  async registerClinic(input: {
    clinicName: string;
    fullName: string;
    email: string;
    password: string;
    slug: string;
    captchaToken?: string;
  }) {
    try {
      const captchaRequired = Boolean(env.VITE_CAPTCHA_SITE_KEY);
      const token = typeof input.captchaToken === "string" ? input.captchaToken.trim() : "";
      if (captchaRequired && !token) {
        throw new Error("Captcha verification required");
      }
      const payload = {
        clinicName: nonEmptySchema.parse(input.clinicName),
        fullName: nonEmptySchema.parse(input.fullName),
        email: emailSchema.parse(input.email),
        password: passwordSchema.parse(input.password),
        slug: slugSchema.parse(input.slug),
        captchaToken: token || undefined,
      };
      const data = await authRepository.registerClinic(payload);
      const error = (data as any)?.error;
      if (error) {
        throw new Error(error);
      }
      return data;
    } catch (err) {
      throw toServiceError(err, "Failed to create clinic");
    }
  },
};
