import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { buildPrivilegedSession, buildMfaComplianceSession, isSuperAdmin, useAuth, type Permission, type PrivilegedRoleTier } from "./authStore";
import { isBlockingProtectedRouteState, isSafeModeState } from "@/services/auth/authStateMachine";
import { isReauthPromptActive } from "@/features/auth/reauthPrompt";
import { useFeatureAccess, type Feature } from "@/core/subscription/useFeatureAccess";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/primitives/Button";
import { useI18n } from "@/core/i18n/i18nStore";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: Permission;
  requiredAnyPermission?: Permission[];
  requiredFeature?: Feature;
  requiredPrivilegedRole?: PrivilegedRoleTier;
}

const LoadingSkeleton = () => (
  <div className="flex h-screen overflow-hidden bg-background">
    {/* Sidebar skeleton */}
    <aside className="hidden lg:flex w-64 flex-col border-e bg-card p-4 space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-md" />
      ))}
    </aside>

    {/* Main content skeleton */}
    <div className="flex-1 p-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  </div>
);

export const ProtectedRoute = ({
  children,
  requiredPermission,
  requiredAnyPermission,
  requiredFeature,
  requiredPrivilegedRole,
}: ProtectedRouteProps) => {
  const { t } = useI18n(["auth", "common"]);
  const { isAuthenticated, isLoading, hasPermission, user, lastVerifiedAt, privilegedAuth, authMachineState } = useAuth();
  const { hasFeature, requiredPlan, isLoading: featureLoading } = useFeatureAccess();
  const privilegedSession = buildPrivilegedSession({ user, lastVerifiedAt, privilegedAuth });
  const mfaCompliance = buildMfaComplianceSession({ user, privilegedAuth });

  if (isLoading || isBlockingProtectedRouteState(authMachineState) || (requiredFeature && featureLoading)) {
    return <LoadingSkeleton />;
  }

  if (isSafeModeState(authMachineState)) {
    return <Navigate to="/login" replace />;
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (
    (authMachineState === "mfa_required" || authMachineState === "mfa_verifying")
    && !isReauthPromptActive()
  ) {
    return <Navigate to="/mfa" replace />;
  }

  if (mfaCompliance.requiresMfaEnrollment) {
    return <Navigate to="/security/privileged" replace />;
  }

  if (!isSuperAdmin(user) && user?.accountStatus === "suspended") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold mb-2">{t("auth.access.accountSuspendedTitle")}</h1>
          <p className="text-muted-foreground mb-3">{t("auth.access.accountSuspendedDescription")}</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin(user) && user?.tenantStatus !== "active") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold mb-2">{t("auth.access.clinicBlockedTitle")}</h1>
          <p className="text-muted-foreground mb-3">
            {t("auth.access.clinicBlockedDescription", { status: user?.tenantStatus })}
          </p>
          {user?.tenantStatusReason ? (
            <p className="text-sm text-muted-foreground">
              {t("auth.access.reason")}: <span className="text-foreground">{user.tenantStatusReason}</span>
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">{t("auth.access.deniedTitle")}</h1>
          <p className="text-muted-foreground">{t("auth.access.deniedDescription")}</p>
        </div>
      </div>
    );
  }

  if (
    requiredAnyPermission
    && requiredAnyPermission.length > 0
    && !requiredAnyPermission.some((perm) => hasPermission(perm))
  ) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-2">{t("auth.access.deniedTitle")}</h1>
          <p className="text-muted-foreground">{t("auth.access.deniedDescription")}</p>
        </div>
      </div>
    );
  }

  if (requiredPrivilegedRole) {
    if (privilegedSession.roleTier !== requiredPrivilegedRole) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-2">{t("auth.access.privilegedRequiredTitle")}</h1>
            <p className="text-muted-foreground">{t("auth.access.privilegedRequiredDescription")}</p>
          </div>
        </div>
      );
    }

    if (privilegedSession.requiresMfaEnrollment || privilegedSession.aal !== "aal2") {
      return <Navigate to="/security/privileged" replace />;
    }
  }

  if (requiredFeature && !hasFeature(requiredFeature)) {
    const planRequired = requiredPlan(requiredFeature);
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold mb-2">{t("auth.access.featureUnavailableTitle")}</h1>
          <p className="text-muted-foreground mb-5">
            {t("auth.access.featureUnavailableDescription")}
          </p>
          {planRequired ? (
            <p className="text-sm text-muted-foreground mb-5">
              {t("auth.access.requiredPlan")}: <span className="font-medium capitalize text-foreground">{planRequired}</span>
            </p>
          ) : null}
          <Button type="button" onClick={() => window.location.assign("/pricing")}>
            {t("common.viewAllPlans")}
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
