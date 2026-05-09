import { useParams, useNavigate } from "react-router-dom";
import { getPrimaryRole, isSuperAdmin, useAuth } from "@/core/auth/authStore";
import { Capabilities, type Capability } from "@/platform/authorization/capabilities";
import { evaluateAuthorize } from "@/platform/authorization/authorize";
import { useI18n } from "@/core/i18n/i18nStore";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { NotificationCenter } from "@/shared/components/NotificationCenter";
import { GlobalSearch } from "@/shared/components/GlobalSearch";
import { PaywallModal } from "@/core/subscription/PaywallModal";
import { UpgradeBanner } from "@/core/subscription/UpgradeBanner";
import { useFeatureAccess, type Feature } from "@/core/subscription/useFeatureAccess";
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope,
  Receipt, Pill, FlaskConical, Shield, BarChart3,
  Settings,
} from "lucide-react";
import { AppLayout, type AppLayoutLabels, type NavItem, type AppUser } from "@/components/layout/AppLayout";
import { Button } from "@/components/primitives/Button";
import { toast } from "@/hooks/use-toast";
import { adminImpersonationService } from "@/services/admin/adminImpersonation.service";
import { isFreshAuthRequiredError } from "@/services/auth/recentAuth.service";
import { useState } from "react";
import { requestReauthentication } from "@/features/auth/reauthPrompt";
import { SessionBoundaryBadge } from "@/components/shell/SessionBoundaryBadge";
import { IncidentBannerSlot } from "@/components/shell/IncidentBannerSlot";
import { RuntimeStatusLayer } from "@/components/shell/RuntimeStatusLayer";

interface NavConfigItem {
  path: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
  capability: Capability;
  feature?: Feature;
}

const navItems: NavConfigItem[] = [
  { path: "dashboard", icon: LayoutDashboard, labelKey: "common.dashboard", capability: Capabilities.dashboard.view },
  { path: "patients", icon: Users, labelKey: "common.patients", capability: Capabilities.patients.view },
  { path: "appointments", icon: CalendarDays, labelKey: "common.appointments", capability: Capabilities.appointments.view, feature: "appointments" },
  { path: "doctors", icon: Stethoscope, labelKey: "common.doctors", capability: Capabilities.dashboard.view },
  { path: "billing", icon: Receipt, labelKey: "common.billing", capability: Capabilities.billing.view, feature: "billing" },
  { path: "pharmacy", icon: Pill, labelKey: "common.pharmacy", capability: Capabilities.pharmacy.manage, feature: "pharmacy" },
  { path: "laboratory", icon: FlaskConical, labelKey: "common.laboratory", capability: Capabilities.laboratory.manage, feature: "laboratory" },
  { path: "insurance", icon: Shield, labelKey: "common.insurance", capability: Capabilities.billing.view, feature: "insurance" },
  { path: "reports", icon: BarChart3, labelKey: "common.reports", capability: Capabilities.reports.view, feature: "reports" },
  { path: "settings", icon: Settings, labelKey: "common.settings", capability: Capabilities.clinic.manage },
] as const;

export const ClinicLayout = () => {
  const { clinicSlug } = useParams();
  const { user, logout, hasPermission, tenantOverride, sessionVersion } = useAuth();
  const { hasFeature } = useFeatureAccess();
  const { t } = useI18n(["admin"]);
  const navigate = useNavigate();
  const [isExitingImpersonation, setIsExitingImpersonation] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleExitImpersonation = async (allowRetry = true) => {
    setIsExitingImpersonation(true);
    try {
      const result = await adminImpersonationService.stop();
      toast({
        title: t("admin.toasts.impersonationEnded"),
        description: t("admin.toasts.impersonationEndedDescription", {
          tenantName: result.targetTenant.name,
        }),
      });
      navigate("/admin");
    } catch (err: any) {
      if (allowRetry && isFreshAuthRequiredError(err)) {
        try {
          await requestReauthentication({
            title: t("auth.reauthTitle"),
            description: t("auth.reauthAdminActionDesc"),
            actionLabel: t("auth.reauthAction"),
            cancelLabel: t("common.cancel"),
          });
          await handleExitImpersonation(false);
        } catch {
          return;
        }
        return;
      }
      toast({
        title: t("admin.toasts.exitImpersonationFailed"),
        description: err?.message || t("admin.toasts.stopImpersonationFailed"),
        variant: "destructive",
      });
    } finally {
      setIsExitingImpersonation(false);
    }
  };

  const visibleNav = navItems.filter((item) => {
    if (!user) return false;
    const allowed = evaluateAuthorize({
      actor: user,
      tenantOverride,
      sessionVersion,
      hasPermission,
      capability: item.capability,
    }).ok;
    return allowed && (!item.feature || hasFeature(item.feature));
  });
  const appNavItems: NavItem[] = visibleNav.map((item) => ({
    path: item.path,
    icon: item.icon,
    label: t(item.labelKey),
  }));

  if (!user || !clinicSlug) return null;

  const appUser: AppUser = {
    id: user.id,
    name: user.name ?? "User",
    email: user.email ?? undefined,
    displayRole: getPrimaryRole(user) ?? undefined,
  };

  const labels: AppLayoutLabels = {
    brandName: t("common.appName"),
    mainNavigation: t("common.mainNavigation"),
    logOut: t("common.logout"),
    collapseSidebar: t("common.collapseSidebar"),
    expandSidebar: t("common.expandSidebar"),
    openMenu: t("common.openMenu"),
    closeMenu: t("common.closeMenu"),
    skipToContent: t("common.skipToContent"),
  };

  return (
    <>
      <IncidentBannerSlot />
      <RuntimeStatusLayer />
      <PaywallModal />
      <AppLayout
        navItems={appNavItems}
        user={appUser}
        onLogout={handleLogout}
        clinicSlug={clinicSlug}
        upgradeSlot={<UpgradeBanner />}
        topbarStartSlot={<GlobalSearch />}
        topbarEndSlot={(
          <>
            <SessionBoundaryBadge className="mr-2" />
            {isSuperAdmin(user) && tenantOverride && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={isExitingImpersonation}
                onClick={() => void handleExitImpersonation()}
              >
                {t("admin.nav.exitTenant", { tenantName: tenantOverride.name })}
              </Button>
            )}
            <LanguageSwitcher />
            <NotificationCenter />
          </>
        )}
        labels={labels}
      />
    </>
  );
};
