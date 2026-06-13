import { AuthorizationError, toServiceError } from "@/services/supabase/errors";
import { useAuth, type PrivilegedRoleTier } from "@/core/auth/authStore";
import { assertAnyPermission } from "@/services/supabase/permissions";
import { recentAuthService } from "./recentAuth.service";
import { privilegedSessionService } from "./privilegedSession.service";
import { privilegedStepUpService } from "./privilegedStepUp.service";
import { STEP_UP_PASSWORD_MAX_AGE_MS } from "./privilegedActionSession.service";

type PrivilegedActionOptions = {
  action: string;
  roleTier: PrivilegedRoleTier;
  requireStepUp?: boolean;
  tenantId?: string | null;
  resourceId?: string | null;
  requestId?: string | null;
};

export const privilegedAccessService = {
  async assertAction(options: PrivilegedActionOptions) {
    try {
      if (options.roleTier === "super_admin") {
        assertAnyPermission(["super_admin"], "Only super admins can access this action");
      }

      const { user } = useAuth.getState();
      if (!user) {
        throw new AuthorizationError("Authentication required", { code: "NOT_AUTHENTICATED" });
      }

      const snapshot = await privilegedSessionService.refresh();
      if (snapshot.roleTier !== options.roleTier) {
        throw new AuthorizationError("You do not have access to this privileged action.", {
          code: "PRIVILEGED_ROLE_REQUIRED",
        });
      }

      if (!snapshot.isMfaEnrolled) {
        throw new AuthorizationError("MFA enrollment is required before using privileged actions.", {
          code: "PRIVILEGED_MFA_ENROLLMENT_REQUIRED",
        });
      }

      if (snapshot.aal !== "aal2") {
        throw new AuthorizationError("An MFA-verified session is required for this action.", {
          code: "MFA_REQUIRED",
          details: snapshot,
        });
      }

      if (!options.requireStepUp) {
        return { stepUpGrantId: null };
      }

      recentAuthService.assertRecentAuth({
        action: options.action,
        maxAgeMs: STEP_UP_PASSWORD_MAX_AGE_MS,
      });
      const stepUpGrantId = await privilegedStepUpService.issueGrant({
        action: options.action,
        roleTier: options.roleTier,
        tenantId: options.tenantId ?? null,
        resourceId: options.resourceId ?? null,
        requestId: options.requestId ?? null,
      });

      return { stepUpGrantId };
    } catch (err) {
      throw toServiceError(err, "Failed to verify privileged action access");
    }
  },
};

export function isPrivilegedMfaEnrollmentRequiredError(err: unknown): err is AuthorizationError {
  return err instanceof AuthorizationError && err.code === "PRIVILEGED_MFA_ENROLLMENT_REQUIRED";
}

export function isMfaRequiredError(err: unknown): err is AuthorizationError {
  return err instanceof AuthorizationError && err.code === "MFA_REQUIRED";
}
