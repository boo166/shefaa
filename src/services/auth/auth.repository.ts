import type {
  AuthMFAEnrollTOTPResponse,
  ChallengeAndVerifyParams,
  Factor,
  User as SupabaseUser,
} from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const PROFILE_COLUMNS = "id, user_id, tenant_id, full_name, avatar_url, account_status, tenants:tenant_id(name, slug, status, status_reason)";

function isInvalidRefreshTokenError(error: { message?: string | null }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("invalid refresh token") ||
    message.includes("refresh token not found")
  );
}

export function isTransientAuthNetworkError(error: { message?: string | null; name?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("network")
    || message.includes("fetch")
    || message.includes("failed to fetch")
    || error.name === "AuthRetryableFetchError"
  );
}

let refreshSessionFlight: Promise<{ error: { message?: string | null; name?: string } | null }> | null = null;

export interface AuthRepository {
  signInWithPassword(email: string, password: string): Promise<SupabaseUser | null>;
  signOut(options?: { scope?: "global" | "local" }): Promise<void>;
  getSession(): Promise<{ user?: SupabaseUser | null; expiresAt?: number; createdAt?: string | null }>;
  refreshSessionSingleFlight(): Promise<{ error: { message?: string | null; name?: string } | null }>;
  onAuthStateChange(
    handler: (event: string, user?: SupabaseUser | null) => void,
  ): () => void;
  resetPasswordForEmail(email: string, redirectTo: string): Promise<void>;
  updatePassword(password: string): Promise<void>;
  getProfileByUserId(userId: string): Promise<any | null>;
  getRolesByUserId(userId: string): Promise<{ tenantRoles: string[]; globalRoles: string[] }>;
  getMfaAssuranceLevel(): Promise<{ currentLevel: string | null; nextLevel: string | null }>;
  listMfaFactors(): Promise<{ all: Factor[]; verified: Factor[]; unverified: Factor[] }>;
  enrollTotpFactor(input?: { friendlyName?: string; issuer?: string }): Promise<NonNullable<AuthMFAEnrollTOTPResponse["data"]>>;
  challengeMfaFactor(factorId: string): Promise<{ id: string }>;
  verifyTotpFactor(input: { factorId: string; challengeId: string; code: string }): Promise<void>;
  unenrollMfaFactor(factorId: string): Promise<void>;
  generateMfaRecoveryCodes(count?: number): Promise<string[]>;
  consumeMfaRecoveryCode(code: string): Promise<boolean>;
  registerClinic(payload: Record<string, unknown>): Promise<unknown>;
}

export const authRepository: AuthRepository = {
  async signInWithPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new ServiceError(error.message ?? "Login failed", { code: error.code, details: error });
    }
    return data.user ?? null;
  },
  async signOut(options) {
    const { error } = await supabase.auth.signOut(options);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to sign out", { code: error.code, details: error });
    }
  },
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      if (isInvalidRefreshTokenError(error)) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        return { user: null };
      }
      throw new ServiceError(error.message ?? "Failed to load session", { code: error.code, details: error });
    }
    const session = data.session;
    const createdAt = session ? (session as { created_at?: string }).created_at ?? null : null;
    return {
      user: session?.user ?? null,
      expiresAt: session?.expires_at,
      createdAt,
    };
  },
  async refreshSessionSingleFlight() {
    if (refreshSessionFlight) return refreshSessionFlight;
    refreshSessionFlight = (async () => {
      const { error } = await supabase.auth.refreshSession();
      return { error: error ? { message: error.message, name: error.name } : null };
    })().finally(() => {
      refreshSessionFlight = null;
    });
    return refreshSessionFlight;
  },
  onAuthStateChange(handler) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      handler(event, session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  },
  async resetPasswordForEmail(email, redirectTo) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to send reset email", { code: error.code, details: error });
    }
  },
  async updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update password", { code: error.code, details: error });
    }
  },
  async getProfileByUserId(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load profile", { code: error.code, details: error });
    }
    return data ?? null;
  },
  async getRolesByUserId(userId) {
    const globalRoleLookup = await (supabase.from as any)("user_global_roles")
      .select("role")
      .eq("user_id", userId)
      .is("revoked_at", null);

    if (globalRoleLookup.error) {
      throw new ServiceError(globalRoleLookup.error.message ?? "Failed to load global role", {
        code: globalRoleLookup.error.code,
        details: globalRoleLookup.error,
      });
    }

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load role", { code: error.code, details: error });
    }

    return {
      tenantRoles: (data ?? []).map((row) => String(row.role)),
      globalRoles: (globalRoleLookup.data ?? []).map((row: { role: string }) => String(row.role)),
    };
  },
  async getMfaAssuranceLevel() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load MFA assurance level", {
        code: error.code,
        details: error,
      });
    }
    return {
      currentLevel: data.currentLevel ?? null,
      nextLevel: data.nextLevel ?? null,
    };
  },
  async listMfaFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load MFA factors", {
        code: error.code,
        details: error,
      });
    }

    const totpFactors = [
      ...(data.totp ?? []),
      ...(data.phone ?? []),
      ...(data.webauthn ?? []),
    ] as Factor[];

    return {
      all: totpFactors,
      verified: totpFactors.filter((factor) => factor.status === "verified"),
      unverified: totpFactors.filter((factor) => factor.status !== "verified"),
    };
  },
  async enrollTotpFactor(input) {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: input?.friendlyName,
      issuer: input?.issuer,
    });

    if (error || !data) {
      throw new ServiceError(error?.message ?? "Failed to enroll MFA factor", {
        code: error?.code,
        details: error,
      });
    }

    return data;
  },
  async challengeMfaFactor(factorId) {
    const { data, error } = await supabase.auth.mfa.challenge({ factorId });
    if (error || !data?.id) {
      throw new ServiceError(error?.message ?? "Failed to challenge MFA factor", {
        code: error?.code,
        details: error,
      });
    }

    return { id: data.id };
  },
  async verifyTotpFactor(input) {
    const params: ChallengeAndVerifyParams = {
      factorId: input.factorId,
      challengeId: input.challengeId,
      code: input.code,
    };

    const { error } = await supabase.auth.mfa.verify(params);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to verify MFA factor", {
        code: error.code,
        details: error,
      });
    }
  },
  async unenrollMfaFactor(factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to remove MFA factor", {
        code: error.code,
        details: error,
      });
    }
  },
  async generateMfaRecoveryCodes(count = 10) {
    const { data, error } = await supabase.rpc("generate_mfa_recovery_codes", { p_count: count });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to generate recovery codes", {
        code: error.code,
        details: error,
      });
    }
    const rows = (data ?? []) as { plain_code?: string | null }[];
    return rows.map((r) => String(r.plain_code ?? "").trim()).filter(Boolean);
  },
  async consumeMfaRecoveryCode(code) {
    const { data, error } = await supabase.rpc("consume_mfa_recovery_code", { p_code: code });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to use recovery code", {
        code: error.code,
        details: error,
      });
    }
    return Boolean(data);
  },
  async registerClinic(payload) {
    const { data, error } = await supabase.functions.invoke("register-clinic", { body: payload });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to register clinic", { code: error.code, details: error });
    }
    return data;
  },
};
