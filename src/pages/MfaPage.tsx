import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Loader2 } from "lucide-react";
import { useAuth, isSuperAdmin, type AuthenticatorAssuranceLevel } from "@/core/auth/authStore";
import { useI18n } from "@/core/i18n/i18nStore";
import { authService } from "@/services/auth/auth.service";
import { identityAuditService } from "@/services/auth/identityAudit.service";
import { privilegedSessionService } from "@/services/auth/privilegedSession.service";
import { emitAuthMetric } from "@/services/auth/authMetrics";
import { sessionVersionFromSupabaseUser } from "@/services/auth/sessionVersion";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Inputs";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

async function bumpSessionVersionAfterMfa(assurance: AuthenticatorAssuranceLevel) {
  const active = await authService.getActiveSession();
  const effTenant = useAuth.getState().tenantOverride?.id ?? useAuth.getState().user?.tenantId ?? null;
  const nextVer = sessionVersionFromSupabaseUser(
    active.user as any,
    effTenant,
    active.createdAt ?? null,
    assurance,
  );
  if (nextVer) useAuth.setState({ sessionVersion: nextVer });
}

export const MfaPage = () => {
  const { t } = useI18n(["auth", "common"]);
  const navigate = useNavigate();
  const { isAuthenticated, user, authMachineState, setAuthMachineState, markSessionVerified } = useAuth();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeMode, setChallengeMode] = useState<"totp" | "recovery">("totp");

  const targetPath = useMemo(() => {
    if (!user) return "/login";
    return isSuperAdmin(user) ? "/admin" : `/tenant/${user.tenantSlug}/dashboard`;
  }, [user]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      navigate("/login", { replace: true });
      return;
    }
    if (authMachineState !== "mfa_required" && authMachineState !== "mfa_verifying") {
      navigate(targetPath, { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const refreshed = await privilegedSessionService.refreshNow();
        const firstVerified = refreshed.factors.verified[0];
        if (!firstVerified?.id) {
          // No verified factor → nothing to verify. Fail open to avoid lockouts.
          setAuthMachineState("authenticated");
          navigate(targetPath, { replace: true });
          return;
        }
        if (!cancelled) setFactorId(firstVerified.id);
      } catch {
        // If we can't load factors, fail open to avoid lockouts.
        setAuthMachineState("authenticated");
        navigate(targetPath, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authMachineState, isAuthenticated, navigate, setAuthMachineState, targetPath, user]);

  const resolveAssuranceAfterTotp = async (): Promise<AuthenticatorAssuranceLevel> => {
    try {
      const aal = await authService.getMfaAssuranceLevel();
      if (aal.currentLevel === "aal1" || aal.currentLevel === "aal2") return aal.currentLevel;
    } catch {
      /* fall through */
    }
    return "aal2";
  };

  const handleVerifyTotp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!factorId) return;
    setLoading(true);
    setAuthMachineState("mfa_verifying");
    try {
      await authService.verifyTotpFactor({ factorId, code: code.trim() });
      await privilegedSessionService.refreshNow();
      const assurance = await resolveAssuranceAfterTotp();
      await bumpSessionVersionAfterMfa(assurance);
      markSessionVerified();
      emitAuthMetric("mfa_challenge_succeeded", { reason: "login", method: "totp" });
      setAuthMachineState("authenticated");
      navigate(targetPath, { replace: true });
    } catch (err) {
      emitAuthMetric("mfa_challenge_failed", { reason: "login", method: "totp" });
      identityAuditService.logAction("MFA_CHALLENGE_FAILED", {
        userId: user?.id,
        tenantId: user?.tenantId,
        actorUserId: user?.id,
        details: { method: "totp" },
      });
      setAuthMachineState("mfa_required");
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("auth.mfa.loginFailedTitle"), description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setAuthMachineState("mfa_verifying");
    try {
      const ok = await authService.consumeMfaRecoveryCode(code.trim());
      if (!ok) {
        throw new Error(t("auth.mfa.recoveryInvalid"));
      }
      await privilegedSessionService.refreshNow();
      // Option B: recovery unlocks login (AAL1); privileged actions require TOTP step-up.
      await bumpSessionVersionAfterMfa("aal1");
      markSessionVerified();
      emitAuthMetric("mfa_challenge_succeeded", { reason: "login", method: "recovery" });
      setAuthMachineState("authenticated");
      navigate(targetPath, { replace: true });
    } catch (err) {
      emitAuthMetric("mfa_challenge_failed", { reason: "login", method: "recovery" });
      identityAuditService.logAction("MFA_CHALLENGE_FAILED", {
        userId: user?.id,
        tenantId: user?.tenantId,
        actorUserId: user?.id,
        details: { method: "recovery" },
      });
      setAuthMachineState("mfa_required");
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("auth.mfa.loginFailedTitle"), description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const totpReady = Boolean(factorId && code.trim().length >= 6);
  const recoveryReady = code.trim().length >= 8;

  return (
    <div className="min-h-screen grid place-items-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-10 w-10 rounded-xl bg-primary/10 text-primary grid place-items-center">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-semibold">{t("auth.mfa.loginTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {challengeMode === "totp" ? t("auth.mfa.loginDescription") : t("auth.mfa.recoveryLoginHint")}
            </p>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={challengeMode === "totp" ? "default" : "outline"}
            onClick={() => {
              setChallengeMode("totp");
              setCode("");
            }}
          >
            {t("auth.mfa.useTotpCode")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={challengeMode === "recovery" ? "default" : "outline"}
            onClick={() => {
              setChallengeMode("recovery");
              setCode("");
            }}
          >
            {t("auth.mfa.useRecoveryCode")}
          </Button>
        </div>

        <form
          onSubmit={challengeMode === "totp" ? handleVerifyTotp : handleVerifyRecovery}
          className="mt-5 space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="mfa-code">
              {challengeMode === "totp" ? t("auth.mfa.oneTimeCode") : t("auth.mfa.recoveryCodeLabel")}
            </Label>
            <Input
              id="mfa-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s+/g, ""))}
              placeholder={
                challengeMode === "totp" ? t("auth.mfa.oneTimeCodePlaceholder") : t("auth.mfa.recoveryCodePlaceholder")
              }
              inputMode={challengeMode === "totp" ? "numeric" : "text"}
              autoFocus
              disabled={loading || (challengeMode === "totp" && !factorId)}
              autoCapitalize="characters"
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={
              loading
              || (challengeMode === "totp" && (!factorId || !totpReady))
              || (challengeMode === "recovery" && !recoveryReady)
            }
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t("auth.mfa.verifyAndContinue")}
          </Button>
        </form>
      </div>
    </div>
  );
};
