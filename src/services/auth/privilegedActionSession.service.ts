import { buildPrivilegedSession, useAuth } from "@/core/auth/authStore";
import { requestReauthentication } from "@/features/auth/reauthPrompt";
import { AuthorizationError } from "@/services/supabase/errors";
import { privilegedSessionService } from "./privilegedSession.service";

/** Matches server `assert_recent_password_auth(300)` in step-up grant RPCs. */
export const STEP_UP_PASSWORD_MAX_AGE_MS = 5 * 60 * 1000;

type PrivilegedActionSessionConfig = {
  title: string;
  description: string;
  actionLabel?: string;
  cancelLabel?: string;
};

export async function ensurePrivilegedActionSession(config: PrivilegedActionSessionConfig) {
  const { user, lastVerifiedAt, privilegedAuth } = useAuth.getState();
  const session = buildPrivilegedSession({ user, lastVerifiedAt, privilegedAuth });
  if (!session.isPrivileged) return;

  await privilegedSessionService.refresh();

  // Single dialog: password first, then MFA inline if sign-in drops assurance to AAL1.
  await requestReauthentication(config);

  const refreshed = await privilegedSessionService.refreshNow();
  if (refreshed.isMfaEnrolled && refreshed.aal !== "aal2") {
    throw new AuthorizationError("An MFA-verified session is required for this action.", {
      code: "MFA_REQUIRED",
      details: refreshed,
    });
  }
}
