import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Inputs";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/core/auth/authStore";
import { useI18n } from "@/core/i18n/i18nStore";
import { useReauthPromptStore } from "./reauthPrompt";
import { reauthService } from "@/services/auth/reauth.service";
import { authService } from "@/services/auth/auth.service";
import { authRepository } from "@/services/auth/auth.repository";
import { privilegedSessionService } from "@/services/auth/privilegedSession.service";

type ChallengeStep = "password" | "mfa";

export const ReauthDialog = () => {
  const { t } = useI18n(["auth"]);
  const { user, markSessionVerified } = useAuth();
  const { request, resolve, reject } = useReauthPromptStore();
  const [step, setStep] = useState<ChallengeStep>("password");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    setStep(request.initialStep ?? "password");
    setPassword("");
    setMfaCode("");
    setError(null);
    setFactorId(null);
  }, [request]);

  useEffect(() => {
    if (!request || step !== "mfa") return;
    let cancelled = false;
    void privilegedSessionService.refresh()
      .then((state) => {
        if (cancelled) return;
        const verified = state.factors.verified[0];
        setFactorId(verified?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setFactorId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [request, step]);

  const handleClose = () => {
    if (loading) return;
    setPassword("");
    setMfaCode("");
    setError(null);
    reject(new Error(t("auth.reauth.cancelled")));
  };

  const completeChallenge = () => {
    setPassword("");
    setMfaCode("");
    setError(null);
    const { authMachineState, setAuthMachineState } = useAuth.getState();
    if (authMachineState === "mfa_required" || authMachineState === "mfa_verifying") {
      setAuthMachineState("authenticated");
    }
    resolve();
  };

  const verifyMfaAndComplete = async () => {
    if (!factorId) {
      setError(t("auth.mfa.notEnrolled"));
      return;
    }
    await authService.verifyTotpFactor({ factorId, code: mfaCode.trim() });
    await privilegedSessionService.refreshNow();
    await authRepository.refreshSessionSingleFlight();
    markSessionVerified();
    completeChallenge();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (step === "password") {
        await reauthService.reauthenticate(password);
        const session = await privilegedSessionService.refreshNow();
        if (session.isMfaEnrolled && session.aal !== "aal2") {
          setPassword("");
          setStep("mfa");
          return;
        }
        completeChallenge();
        return;
      }

      await verifyMfaAndComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  if (!request) return null;

  const isMfaStep = step === "mfa";
  const submitDisabled = isMfaStep
    ? !factorId || mfaCode.trim().length < 6
    : !password.trim();

  return (
    <Dialog open={!!request} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md" hideClose={loading}>
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription>
            {isMfaStep ? t("auth.mfa.sessionActionRequired") : request.description}
            {!isMfaStep && user?.email ? (
              <span className="mt-2 block text-xs text-muted-foreground">
                {t("auth.reauthEmailHint").replace("{email}", user.email)}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isMfaStep ? (
            <div className="space-y-2">
              <Label htmlFor="reauth-mfa-code">{t("auth.mfa.oneTimeCode")}</Label>
              <Input
                id="reauth-mfa-code"
                type="text"
                inputMode="numeric"
                autoFocus
                value={mfaCode}
                error={!!error}
                onChange={(e) => setMfaCode(e.target.value.replace(/\s+/g, ""))}
                placeholder={t("auth.mfa.oneTimeCodePlaceholder")}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="reauth-password">{t("auth.passwordLabel")}</Label>
              <Input
                id="reauth-password"
                type="password"
                autoFocus
                value={password}
                error={!!error}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              {request.cancelLabel ?? t("common.cancel")}
            </Button>
            <Button type="submit" loading={loading} disabled={submitDisabled}>
              {isMfaStep
                ? (request.actionLabel ?? t("auth.mfa.verifySession"))
                : (request.actionLabel ?? t("auth.reauthAction"))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
