import { useEffect, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Link, useNavigate } from "react-router-dom";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/primitives/Button";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { PricingPlanDialog } from "@/features/admin/PricingPlanDialog";
import { TenantFormDialog } from "@/features/admin/TenantFormDialog";
import { TenantModulesDialog } from "@/features/admin/TenantModulesDialog";
import { TenantStatusDialog } from "@/features/admin/TenantStatusDialog";
import { TenantUsageDialog } from "@/features/admin/TenantUsageDialog";
import { JobRetryDialog } from "@/features/admin/JobRetryDialog";
import {
  Building2, Users, CreditCard, TrendingUp,
  BarChart3, LogOut, Eye, ChevronRight, Crown, HeartPulse,
  Activity, AlertTriangle, Server, Plus, Pencil, Trash2, PauseCircle, PlayCircle, OctagonX, Shield, RotateCcw,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatNumber } from "@/shared/utils/formatDate";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/Inputs";
import { adminService, createAdminMutationContext } from "@/services/admin/admin.service";
import { adminImpersonationService } from "@/services/admin/adminImpersonation.service";
import { isFreshAuthRequiredError } from "@/services/auth/recentAuth.service";
import { queryKeys } from "@/services/queryKeys";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { requestReauthentication } from "@/features/auth/reauthPrompt";
import type {
  AdminAuthMetricTrendPoint,
  AdminClientErrorTrendPoint,
  AdminTenantFeatureFlag,
  AdminPricingPlan,
  AdminRecentActivity,
  AdminRecentJobActivity,
  AdminRecentSystemError,
  AdminTenant,
} from "@/domain/admin/admin.types";

type AdminTab = "overview" | "operations" | "clinics" | "users" | "subscriptions" | "pricing";

const PLAN_OPTIONS = ["free", "starter", "pro", "enterprise"] as const;
const STATUS_OPTIONS = ["active", "trialing", "expired", "canceled"] as const;
const BILLING_CYCLE_OPTIONS = ["monthly", "annual"] as const;

function updatePayloadFromAction(action: { field: "plan" | "status" | "billing_cycle"; value: string }) {
  if (action.field === "plan") {
    return { plan: action.value as "enterprise" | "free" | "pro" | "starter" };
  }
  if (action.field === "billing_cycle") {
    return { billing_cycle: action.value as "monthly" | "annual" };
  }
  return { status: action.value as "active" | "canceled" | "expired" | "trialing" };
}

function formatTrendBucketLabel(bucketStart: string, locale: "en" | "ar") {
  return formatDate(bucketStart, locale, "time");
}

function formatRate(success: number, failure: number, locale: "en" | "ar") {
  const total = success + failure;
  if (total === 0) return "100%";
  return `${formatNumber(Math.round((success / total) * 100), locale)}%`;
}

export const AdminDashboardPage = () => {
  const { locale, t } = useI18n(["admin"]);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [operationsTenantFilter, setOperationsTenantFilter] = useState<string>("all");
  const [clinicFilter, setClinicFilter] = useState<string | null>(null);
  const [subFilter, setSubFilter] = useState<string | null>(null);
  const [clinicPage, setClinicPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [subPage, setSubPage] = useState(1);
  const [clinicSearch, setClinicSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [subSearch, setSubSearch] = useState("");
  const [impersonatingTenantId, setImpersonatingTenantId] = useState<string | null>(null);
  const [clinicSort, setClinicSort] = useState<{ column: "name" | "created_at"; direction: "asc" | "desc" }>({
    column: "created_at",
    direction: "desc",
  });
  const [userSort, setUserSort] = useState<{ column: "full_name" | "created_at"; direction: "asc" | "desc" }>({
    column: "created_at",
    direction: "desc",
  });
  const [subSort, setSubSort] = useState<{
    column: "plan" | "status" | "amount" | "expires_at" | "created_at";
    direction: "asc" | "desc";
  }>({
    column: "created_at",
    direction: "desc",
  });
  const debouncedClinicSearch = useDebouncedValue(clinicSearch, 300);
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const debouncedSubSearch = useDebouncedValue(subSearch, 300);
  const [confirmAction, setConfirmAction] = useState<{ id: string; field: "plan" | "status" | "billing_cycle"; value: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [pricingDialogMode, setPricingDialogMode] = useState<"create" | "edit">("create");
  const [editingPricingPlan, setEditingPricingPlan] = useState<AdminPricingPlan | null>(null);
  const [pricingDeletePlan, setPricingDeletePlan] = useState<AdminPricingPlan | null>(null);
  const [pricingDialogOpen, setPricingDialogOpen] = useState(false);
  const [pricingSaveLoading, setPricingSaveLoading] = useState(false);
  const [pricingDeleteLoading, setPricingDeleteLoading] = useState(false);
  const [tenantDialogMode, setTenantDialogMode] = useState<"create" | "edit">("create");
  const [editingTenant, setEditingTenant] = useState<AdminTenant | null>(null);
  const [tenantDialogOpen, setTenantDialogOpen] = useState(false);
  const [tenantSaveLoading, setTenantSaveLoading] = useState(false);
  const [tenantModulesTarget, setTenantModulesTarget] = useState<AdminTenant | null>(null);
  const [tenantModuleSavingKey, setTenantModuleSavingKey] = useState<AdminTenantFeatureFlag["feature_key"] | null>(null);
  const [tenantStatusTarget, setTenantStatusTarget] = useState<{
    tenant: AdminTenant;
    status: "active" | "suspended" | "deactivated";
  } | null>(null);
  const [tenantStatusLoading, setTenantStatusLoading] = useState(false);
  const [tenantUsageTarget, setTenantUsageTarget] = useState<AdminTenant | null>(null);
  const [jobRetryTarget, setJobRetryTarget] = useState<{ ids: string[]; tenantName?: string | null } | null>(null);
  const [jobRetryLoading, setJobRetryLoading] = useState(false);
  const pageSize = 20;
  const operationsTenantId = operationsTenantFilter === "all" ? undefined : operationsTenantFilter;

  useEffect(() => {
    setClinicPage(1);
  }, [debouncedClinicSearch, clinicFilter, clinicSort]);

  useEffect(() => {
    setUserPage(1);
  }, [debouncedUserSearch, userSort]);

  useEffect(() => {
    setSubPage(1);
  }, [debouncedSubSearch, subFilter, subSort]);

  const { data: tenantsResponse, isLoading: loadingTenants } = useQuery({
    queryKey: queryKeys.admin.tenants({
      page: clinicPage,
      pageSize,
      search: debouncedClinicSearch.trim() || undefined,
      plan: clinicFilter ?? undefined,
      sort: clinicSort,
    }),
    queryFn: () =>
      adminService.listTenantsPaged({
        page: clinicPage,
        pageSize,
        search: debouncedClinicSearch.trim() || undefined,
        plan: clinicFilter ?? undefined,
        sort: clinicSort,
      }),
  });

  const { data: profilesResponse, isLoading: loadingProfiles } = useQuery({
    queryKey: queryKeys.admin.profiles({
      page: userPage,
      pageSize,
      search: debouncedUserSearch.trim() || undefined,
      sort: userSort,
    }),
    queryFn: () =>
      adminService.listProfilesWithRolesPaged({
        page: userPage,
        pageSize,
        search: debouncedUserSearch.trim() || undefined,
        sort: userSort,
      }),
  });

  const { data: subscriptionsResponse, isLoading: loadingSubs } = useQuery({
    queryKey: queryKeys.admin.subscriptions({
      page: subPage,
      pageSize,
      search: debouncedSubSearch.trim() || undefined,
      plan: subFilter ?? undefined,
      sort: subSort,
    }),
    queryFn: () =>
      adminService.listSubscriptionsPaged({
        page: subPage,
        pageSize,
        search: debouncedSubSearch.trim() || undefined,
        plan: subFilter ?? undefined,
        sort: subSort,
      }),
  });

  const { data: subscriptionStats } = useQuery({
    queryKey: queryKeys.admin.subscriptionStats(),
    queryFn: () => adminService.getSubscriptionStats(),
  });

  const {
    data: operationsDashboard,
    isLoading: loadingOperationsDashboard,
  } = useQuery({
    queryKey: queryKeys.admin.operationsDashboard(operationsTenantId),
    queryFn: () => adminService.getOperationsDashboard(operationsTenantId),
    enabled: activeTab === "overview" || activeTab === "operations",
  });

  const {
    data: recentAdminActivity = [],
    isLoading: loadingRecentAdminActivity,
  } = useQuery({
    queryKey: queryKeys.admin.activity(operationsTenantId),
    queryFn: () => adminService.getRecentActivity(operationsTenantId),
    enabled: activeTab === "overview" || activeTab === "operations",
  });

  const { data: pricingPlans = [], isLoading: loadingPricingPlans } = useQuery({
    queryKey: queryKeys.admin.pricingPlans(),
    queryFn: () => adminService.listPricingPlans(),
    enabled: activeTab === "pricing",
  });

  const {
    data: tenantFeatureFlags = [],
    isLoading: loadingTenantFeatureFlags,
  } = useQuery({
    queryKey: tenantModulesTarget ? queryKeys.admin.featureFlags(tenantModulesTarget.id) : ["admin", "featureFlags", "idle"],
    queryFn: () => adminService.listTenantFeatureFlags(tenantModulesTarget!.id),
    enabled: !!tenantModulesTarget,
  });

  const { data: recentTenantsResponse } = useQuery({
    queryKey: queryKeys.admin.tenants({ page: 1, pageSize: 100 }),
    queryFn: () => adminService.listTenantsPaged({ page: 1, pageSize: 100 }),
  });

  const { data: tenantUsage, isLoading: loadingTenantUsage } = useQuery({
    queryKey: tenantUsageTarget ? queryKeys.admin.tenantUsage(tenantUsageTarget.id) : ["admin", "tenantUsage", "idle"],
    queryFn: () => adminService.getTenantUsage(tenantUsageTarget!.id),
    enabled: !!tenantUsageTarget,
  });

  const tenants = tenantsResponse?.data ?? [];
  const profiles = profilesResponse?.data ?? [];
  const subscriptions = subscriptionsResponse?.data ?? [];
  const recentTenants = recentTenantsResponse?.data ?? [];
  const retryableJobs = (operationsDashboard?.recent_job_activity ?? []).filter(
    (job) => job.status === "dead_letter" || Boolean(job.last_error),
  );
  const failedJobsFeed = (operationsDashboard?.recent_job_activity ?? []).filter(
    (job) => job.status === "dead_letter" || job.status === "failed",
  );

  const totalClinics = tenantsResponse?.total ?? 0;
  const totalUsers = profilesResponse?.total ?? 0;
  const activeSubs = subscriptionStats?.active_count ?? 0;
  const totalRevenue = subscriptionStats?.total_revenue ?? 0;
  const operationsSummary = operationsDashboard?.summary;
  const operationsSeverityVariant =
    operationsDashboard?.overall_severity === "critical"
      ? "destructive"
      : operationsDashboard?.overall_severity === "warning"
        ? "warning"
        : "success";
  const translatePlan = (plan?: string | null) =>
    t(`admin.common.planOptions.${plan ?? "free"}`);
  const translateSubscriptionStatus = (status: string) =>
    t(`admin.common.subscriptionStatusOptions.${status}`);
  const translateTenantStatus = (status: string) =>
    t(`admin.common.tenantStatusOptions.${status}`);
  const translateCycle = (cycle: string) =>
    t(`admin.common.billingCycleOptions.${cycle}`);
  const translateField = (field: "plan" | "status" | "billing_cycle") =>
    t(`admin.common.subscriptionFieldOptions.${field}`);
  const translateSeverity = (severity?: string | null) =>
    severity ? t(`admin.common.severityOptions.${severity}`) : t("admin.common.severityOptions.healthy");
  const translateJobStatus = (status: string) =>
    t(`admin.common.jobStatusOptions.${status}`);
  const translateLogLevel = (level: string) =>
    t(`admin.common.logLevelOptions.${level}`);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const requestFreshAuth = async () => {
    await requestReauthentication({
      title: t("auth.reauthTitle"),
      description: t("auth.reauthAdminActionDesc"),
      actionLabel: t("auth.reauthAction"),
      cancelLabel: t("common.cancel"),
    });
  };

  const handleImpersonateTenant = async (
    tenant: { id: string; slug: string; name: string },
    allowRetry = true,
  ) => {
    setImpersonatingTenantId(tenant.id);
    try {
      await adminImpersonationService.start(tenant);
      toast({
        title: t("admin.toasts.impersonationStarted"),
        description: t("admin.toasts.impersonationStartedDescription", {
          tenantName: tenant.name,
        }),
      });
      navigate(`/tenant/${tenant.slug}/dashboard`);
    } catch (err: any) {
      if (allowRetry && isFreshAuthRequiredError(err)) {
        try {
          await requestFreshAuth();
          await handleImpersonateTenant(tenant, false);
        } catch {
          return;
        }
        return;
      }
      toast({
        title: t("admin.toasts.openClinicFailed"),
        description: err?.message || t("admin.toasts.startImpersonationFailed"),
        variant: "destructive",
      });
    } finally {
      setImpersonatingTenantId(null);
    }
  };

  const handleSubUpdate = async () => {
    if (!confirmAction) return;
    const action = confirmAction;
    const mutationContext = createAdminMutationContext();
    setActionLoading(true);
    try {
      const updatePayload = updatePayloadFromAction(action);
      await adminService.updateSubscription(action.id, updatePayload, mutationContext);
      toast({
        title: t("admin.toasts.subscriptionUpdated"),
        description: t("admin.toasts.subscriptionUpdatedDescription", {
          field: translateField(action.field),
          value: action.field === "plan"
            ? translatePlan(action.value)
            : action.field === "billing_cycle"
              ? translateCycle(action.value)
              : translateSubscriptionStatus(action.value),
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.subscriptionStats() });
      queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
    } catch (err: any) {
      if (isFreshAuthRequiredError(err)) {
        try {
          await requestFreshAuth();
          await adminService.updateSubscription(action.id, updatePayloadFromAction(action), mutationContext);
          toast({
            title: t("admin.toasts.subscriptionUpdated"),
            description: t("admin.toasts.subscriptionUpdatedDescription", {
              field: translateField(action.field),
              value: action.field === "plan"
                ? translatePlan(action.value)
                : action.field === "billing_cycle"
                  ? translateCycle(action.value)
                  : translateSubscriptionStatus(action.value),
            }),
          });
          queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
          queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
          queryClient.invalidateQueries({ queryKey: queryKeys.admin.subscriptionStats() });
          queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
        } catch {
          return;
        }
        return;
      }
      toast({
        title: t("common.error"),
        description: err?.message || t("admin.toasts.updateFailed"),
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const openCreateTenant = () => {
    setTenantDialogMode("create");
    setEditingTenant(null);
    setTenantDialogOpen(true);
  };

  const openEditTenant = (tenant: AdminTenant) => {
    setTenantDialogMode("edit");
    setEditingTenant(tenant);
    setTenantDialogOpen(true);
  };

  const handleTenantSubmit = async (input: any) => {
    const mutationContext = createAdminMutationContext();
    setTenantSaveLoading(true);
    try {
      if (tenantDialogMode === "create") {
        await adminService.createTenant(input, mutationContext);
        toast({
          title: t("admin.toasts.tenantCreated"),
          description: t("admin.toasts.tenantCreatedDescription"),
        });
      } else if (editingTenant) {
        await adminService.updateTenant(editingTenant.id, input, mutationContext);
        toast({
          title: t("admin.toasts.tenantUpdated"),
          description: t("admin.toasts.tenantUpdatedDescription", {
            name: editingTenant.name,
          }),
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
      ]);

      setTenantDialogOpen(false);
      setEditingTenant(null);
    } catch (err: any) {
      if (isFreshAuthRequiredError(err)) {
        try {
          await requestFreshAuth();
          if (tenantDialogMode === "create") {
            await adminService.createTenant(input, mutationContext);
          } else if (editingTenant) {
            await adminService.updateTenant(editingTenant.id, input, mutationContext);
          }
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] }),
            queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] }),
            queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
          ]);
          toast({
            title: t("admin.toasts.tenantSaved"),
            description: t("admin.toasts.tenantSavedDescription"),
          });
          setTenantDialogOpen(false);
          setEditingTenant(null);
        } catch {
          return;
        }
        return;
      }

      toast({
        title: t("admin.toasts.tenantSaveFailed"),
        description: err?.message || t("admin.toasts.tenantSaveFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setTenantSaveLoading(false);
    }
  };

  const handleTenantStatusSubmit = async (input: { status: "active" | "suspended" | "deactivated"; status_reason: string | null }) => {
    if (!tenantStatusTarget) return;
    const mutationContext = createAdminMutationContext();
    setTenantStatusLoading(true);
    try {
      await adminService.updateTenantStatus(tenantStatusTarget.tenant.id, input, mutationContext);
      toast({
        title: t("admin.toasts.tenantStatusUpdated"),
        description: t("admin.toasts.tenantStatusUpdatedDescription", {
          name: tenantStatusTarget.tenant.name,
          status: translateTenantStatus(input.status),
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
      ]);
      setTenantStatusTarget(null);
    } catch (err: any) {
      if (isFreshAuthRequiredError(err)) {
        try {
          await requestFreshAuth();
          await adminService.updateTenantStatus(tenantStatusTarget.tenant.id, input, mutationContext);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] }),
            queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] }),
            queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
          ]);
          toast({
            title: t("admin.toasts.tenantStatusUpdated"),
            description: t("admin.toasts.tenantStatusUpdatedDescription", {
              name: tenantStatusTarget.tenant.name,
              status: translateTenantStatus(input.status),
            }),
          });
          setTenantStatusTarget(null);
        } catch {
          return;
        }
        return;
      }

      toast({
        title: t("admin.toasts.tenantStatusFailed"),
        description: err?.message || t("admin.toasts.tenantStatusFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setTenantStatusLoading(false);
    }
  };

  const handleTenantModuleToggle = async (featureKey: AdminTenantFeatureFlag["feature_key"], enabled: boolean) => {
    if (!tenantModulesTarget) return;

    const mutationContext = createAdminMutationContext();
    setTenantModuleSavingKey(featureKey);
    try {
      await adminService.updateTenantFeatureFlag(tenantModulesTarget.id, {
        feature_key: featureKey,
        enabled,
      }, mutationContext);
      toast({
        title: t("admin.toasts.tenantModuleUpdated"),
        description: t("admin.toasts.tenantModuleUpdatedDescription", {
          name: tenantModulesTarget.name,
          state: enabled ? t("admin.toasts.enabled") : t("admin.toasts.disabled"),
          feature: t(`admin.tenantModules.features.${featureKey}.title`),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureFlags(tenantModulesTarget.id) });
      await queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
    } catch (err: any) {
      if (isFreshAuthRequiredError(err)) {
        try {
          await requestFreshAuth();
          await adminService.updateTenantFeatureFlag(tenantModulesTarget.id, {
            feature_key: featureKey,
            enabled,
          }, mutationContext);
          await queryClient.invalidateQueries({ queryKey: queryKeys.admin.featureFlags(tenantModulesTarget.id) });
          await queryClient.invalidateQueries({ queryKey: ["admin", "activity"] });
          toast({
            title: t("admin.toasts.tenantModuleUpdated"),
            description: t("admin.toasts.tenantModuleUpdatedDescription", {
              name: tenantModulesTarget.name,
              state: enabled ? t("admin.toasts.enabled") : t("admin.toasts.disabled"),
              feature: t(`admin.tenantModules.features.${featureKey}.title`),
            }),
          });
        } catch {
          return;
        }
        return;
      }

      toast({
        title: t("admin.toasts.tenantModuleFailed"),
        description: err?.message || t("admin.toasts.tenantModuleFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setTenantModuleSavingKey(null);
    }
  };

  const handleRetryJobs = async (reason: string) => {
    if (!jobRetryTarget) return;
    const mutationContext = createAdminMutationContext();
    setJobRetryLoading(true);
    try {
      await adminService.retryJobs({
        job_ids: jobRetryTarget.ids,
        reason,
      }, mutationContext);
      toast({
        title: jobRetryTarget.ids.length > 1 ? "Jobs requeued" : "Job requeued",
        description: jobRetryTarget.ids.length > 1
          ? `${jobRetryTarget.ids.length} jobs were requeued safely.`
          : "The selected job was requeued safely.",
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.operationsDashboard(operationsTenantId) }),
        queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
      ]);
      setJobRetryTarget(null);
    } catch (err: any) {
      if (isFreshAuthRequiredError(err)) {
        try {
          await requestFreshAuth();
          await adminService.retryJobs({
            job_ids: jobRetryTarget.ids,
            reason,
          }, mutationContext);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.operationsDashboard(operationsTenantId) }),
            queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
          ]);
          toast({
            title: jobRetryTarget.ids.length > 1 ? "Jobs requeued" : "Job requeued",
            description: jobRetryTarget.ids.length > 1
              ? `${jobRetryTarget.ids.length} jobs were requeued safely.`
              : "The selected job was requeued safely.",
          });
          setJobRetryTarget(null);
        } catch {
          return;
        }
        return;
      }

      toast({
        title: "Unable to retry jobs",
        description: err?.message || "The selected jobs could not be retried.",
        variant: "destructive",
      });
    } finally {
      setJobRetryLoading(false);
    }
  };

  const availablePlanCodes = PLAN_OPTIONS.filter(
    (planCode) => !pricingPlans.some((plan) => plan.plan_code === planCode),
  );

  const openCreatePricingPlan = () => {
    setPricingDialogMode("create");
    setEditingPricingPlan(null);
    setPricingDialogOpen(true);
  };

  const openEditPricingPlan = (plan: AdminPricingPlan) => {
    setPricingDialogMode("edit");
    setEditingPricingPlan(plan);
    setPricingDialogOpen(true);
  };

  const handlePricingPlanSubmit = async (input: any) => {
    const mutationContext = createAdminMutationContext();
    setPricingSaveLoading(true);
    try {
      if (pricingDialogMode === "create") {
        await adminService.createPricingPlan(input, mutationContext);
        toast({
          title: t("admin.toasts.pricingPlanCreated"),
          description: t("admin.toasts.pricingPlanCreatedDescription"),
        });
      } else if (editingPricingPlan) {
        await adminService.updatePricingPlan(editingPricingPlan.id, input, mutationContext);
        toast({
          title: t("admin.toasts.pricingUpdated"),
          description: t("admin.toasts.pricingUpdatedDescription"),
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.pricingPlans() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pricing.public() }),
        queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.subscriptionStats() }),
        queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
      ]);

      setPricingDialogOpen(false);
      setEditingPricingPlan(null);
    } catch (err: any) {
      if (isFreshAuthRequiredError(err)) {
        try {
          await requestFreshAuth();
          if (pricingDialogMode === "create") {
            await adminService.createPricingPlan(input, mutationContext);
          } else if (editingPricingPlan) {
            await adminService.updatePricingPlan(editingPricingPlan.id, input, mutationContext);
          }

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.pricingPlans() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.pricing.public() }),
            queryClient.invalidateQueries({ queryKey: ["admin", "subscriptions"] }),
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.subscriptionStats() }),
            queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
          ]);

          toast({
            title: t("admin.toasts.pricingUpdated"),
            description: t("admin.toasts.pricingUpdatedDescription"),
          });
          setPricingDialogOpen(false);
          setEditingPricingPlan(null);
        } catch {
          return;
        }
        return;
      }

      toast({
        title: t("admin.toasts.pricingSaveFailed"),
        description: err?.message || t("admin.toasts.pricingSaveFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setPricingSaveLoading(false);
    }
  };

  const handleDeletePricingPlan = async () => {
    if (!pricingDeletePlan) return;

    const mutationContext = createAdminMutationContext();
    setPricingDeleteLoading(true);
    try {
      await adminService.deletePricingPlan(pricingDeletePlan.id, mutationContext);
      toast({
        title: t("admin.toasts.pricingDeleted"),
        description: t("admin.toasts.pricingDeletedDescription", {
          name: pricingDeletePlan.name,
        }),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.pricingPlans() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pricing.public() }),
        queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
      ]);
      setPricingDeletePlan(null);
    } catch (err: any) {
      if (isFreshAuthRequiredError(err)) {
        try {
          await requestFreshAuth();
          await adminService.deletePricingPlan(pricingDeletePlan.id, mutationContext);
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.admin.pricingPlans() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.pricing.public() }),
            queryClient.invalidateQueries({ queryKey: ["admin", "activity"] }),
          ]);
          toast({
            title: t("admin.toasts.pricingDeleted"),
            description: t("admin.toasts.pricingDeletedDescription", {
              name: pricingDeletePlan.name,
            }),
          });
          setPricingDeletePlan(null);
        } catch {
          return;
        }
        return;
      }

      toast({
        title: t("admin.toasts.pricingDeleteFailed"),
        description: err?.message || t("admin.toasts.pricingDeleteFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setPricingDeleteLoading(false);
    }
  };

  const tabs: { key: AdminTab; icon: any; label: string }[] = [
    { key: "overview", icon: BarChart3, label: t("admin.tabs.overview") },
    { key: "operations", icon: Server, label: t("admin.tabs.operations") },
    { key: "clinics", icon: Building2, label: t("admin.tabs.clinics") },
    { key: "users", icon: Users, label: t("admin.tabs.users") },
    { key: "subscriptions", icon: CreditCard, label: t("admin.tabs.subscriptions") },
    { key: "pricing", icon: TrendingUp, label: t("admin.tabs.pricing") },
  ];

  const clinicColumns: Column<any>[] = [
    { key: "name", header: t("admin.clinics.columns.clinicName"), searchable: true, sortable: true, render: (c) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{c.name?.charAt(0)}</div>
        <div>
          <p className="font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.slug}</p>
        </div>
      </div>
    )},
    { key: "email", header: t("admin.clinics.columns.email"), searchable: true, render: (c) => c.email || "-" },
    { key: "phone", header: t("admin.clinics.columns.phone"), render: (c) => c.phone || "-" },
    {
      key: "plan",
      header: t("admin.clinics.columns.plan"),
      render: (c) => {
        const plan = c.plan ?? "free";
        const variant = plan === "pro" ? "success" : plan === "enterprise" ? "info" : "default";
        return <StatusBadge variant={variant as any}>{translatePlan(plan)}</StatusBadge>;
      },
    },
    {
      key: "tenant_status",
      header: t("admin.clinics.columns.lifecycle"),
      render: (c) => (
        <StatusBadge
          variant={
            c.tenant_status === "active"
              ? "success"
              : c.tenant_status === "suspended"
                ? "warning"
                : "destructive"
          }
        >
          {translateTenantStatus(c.tenant_status)}
        </StatusBadge>
      ),
    },
    { key: "created_at", header: t("admin.dashboard.created"), sortable: true, render: (c) => formatDate(c.created_at, locale, "date") },
    { key: "actions", header: "", render: (c) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("admin.clinics.actions.edit")}
          title={t("admin.clinics.actions.edit")}
          data-testid={`admin-clinic-edit-${c.id}`}
          onClick={() => openEditTenant(c)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="View usage"
          title="View usage"
          data-testid={`admin-clinic-usage-${c.id}`}
          onClick={() => setTenantUsageTarget(c)}
        >
          <Activity className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("admin.clinics.actions.modules")}
          title={t("admin.clinics.actions.modules")}
          data-testid={`admin-clinic-modules-${c.id}`}
          onClick={() => setTenantModulesTarget(c)}
        >
          <Shield className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("admin.clinics.actions.view")}
          title={t("admin.clinics.actions.view")}
          data-testid={`admin-clinic-view-${c.id}`}
          disabled={impersonatingTenantId === c.id}
          onClick={() => void handleImpersonateTenant({ id: c.id, slug: c.slug, name: c.name })}
        >
          <Eye className="h-4 w-4" />
        </Button>
        {c.tenant_status === "active" ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("admin.clinics.actions.suspend")}
              title={t("admin.clinics.actions.suspend")}
              data-testid={`admin-clinic-suspend-${c.id}`}
              onClick={() => setTenantStatusTarget({ tenant: c, status: "suspended" })}
            >
              <PauseCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("admin.clinics.actions.deactivate")}
              title={t("admin.clinics.actions.deactivate")}
              data-testid={`admin-clinic-deactivate-${c.id}`}
              onClick={() => setTenantStatusTarget({ tenant: c, status: "deactivated" })}
            >
              <OctagonX className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("admin.clinics.actions.reactivate")}
            title={t("admin.clinics.actions.reactivate")}
            data-testid={`admin-clinic-reactivate-${c.id}`}
            onClick={() => setTenantStatusTarget({ tenant: c, status: "active" })}
          >
            <PlayCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    )},
  ];

  const recentClinicColumns: Column<any>[] = [
    {
      key: "name",
      header: t("admin.clinics.columns.clinic"),
      render: (t) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{t.name?.charAt(0)}</div>
          <div>
            <p className="font-medium">{t.name}</p>
            <p className="text-xs text-muted-foreground">{t.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: "plan",
      header: t("admin.clinics.columns.plan"),
      render: (t) => {
        const plan = t.plan ?? "free";
        const variant = plan === "pro" ? "success" : plan === "enterprise" ? "info" : "default";
        return <StatusBadge variant={variant as any}>{translatePlan(plan)}</StatusBadge>;
      },
    },
    {
      key: "tenant_status",
      header: t("admin.clinics.columns.lifecycle"),
      render: (t) => (
        <StatusBadge
          variant={
            t.tenant_status === "active"
              ? "success"
              : t.tenant_status === "suspended"
                ? "warning"
                : "destructive"
          }
        >
          {translateTenantStatus(t.tenant_status)}
        </StatusBadge>
      ),
    },
    {
      key: "created_at",
      header: t("admin.dashboard.created"),
      render: (t) => <span className="text-muted-foreground">{formatDate(t.created_at, locale, "date")}</span>,
    },
  ];

  const userColumns: Column<any>[] = [
    { key: "full_name", header: t("admin.users.columns.name"), searchable: true, sortable: true, render: (p) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
          {p.full_name?.charAt(0) || "U"}
        </div>
        <span className="font-medium">{p.full_name}</span>
      </div>
    )},
    { key: "role", header: t("admin.users.columns.role"), render: (p) => {
      const role = (p.user_roles as any)?.[0]?.role || "-";
      const variant = role === "clinic_admin" ? "info" : role === "super_admin" ? "destructive" : "default";
      return <StatusBadge variant={variant as any}>{role === "-" ? "-" : t(`roles.${role}`)}</StatusBadge>;
    }},
    { key: "tenant_id", header: t("admin.users.columns.clinic"), render: (p) => p.tenants?.name || "-" },
    { key: "created_at", header: t("admin.dashboard.joined"), sortable: true, render: (p) => formatDate(p.created_at, locale, "date") },
  ];

  const subColumns: Column<any>[] = [
    { key: "tenant", header: t("admin.subscriptions.columns.clinic"), searchable: true, render: (s) => (
      <div className="flex items-center gap-3">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium">{(s.tenants as any)?.name || "-"}</p>
          <p className="text-xs text-muted-foreground">{(s.tenants as any)?.slug || ""}</p>
        </div>
      </div>
    )},
    { key: "plan", header: t("admin.subscriptions.columns.plan"), sortable: true, render: (s) => (
      <Select
        value={s.plan}
        onValueChange={(val) => setConfirmAction({ id: s.id, field: "plan", value: val })}
      >
        <SelectTrigger size="sm" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PLAN_OPTIONS.map((p) => (
            <SelectItem key={p} value={p}>{translatePlan(p)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )},
    {
      key: "amount",
      header: t("admin.subscriptions.columns.amount"),
      sortable: true,
      render: (s) => s.amount > 0
        ? formatCurrency(Number(s.amount), locale, s.currency)
        : t("admin.subscriptions.freeAmount"),
    },
    { key: "billing_cycle", header: t("admin.subscriptions.columns.cycle"), render: (s) => (
      <Select
        value={s.billing_cycle}
        onValueChange={(val) => setConfirmAction({ id: s.id, field: "billing_cycle", value: val })}
      >
        <SelectTrigger size="sm" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BILLING_CYCLE_OPTIONS.map((cycle) => (
            <SelectItem key={cycle} value={cycle}>{translateCycle(cycle)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )},
    { key: "status", header: t("admin.subscriptions.columns.status"), sortable: true, render: (s) => (
      <Select
        value={s.status}
        onValueChange={(val) => setConfirmAction({ id: s.id, field: "status", value: val })}
      >
        <SelectTrigger size="sm" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((st) => (
            <SelectItem key={st} value={st}>{translateSubscriptionStatus(st)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )},
    { key: "expires_at", header: t("admin.dashboard.expires"), sortable: true, render: (s) => s.expires_at ? formatDate(s.expires_at, locale, "date") : "-" },
  ];

  const jobActivityColumns: Column<AdminRecentJobActivity>[] = [
    {
      key: "type",
      header: t("admin.operations.jobColumn"),
      render: (job) => (
        <div>
          <p className="font-medium">{job.type}</p>
          <p className="text-xs text-muted-foreground">{job.tenant_name || t("admin.common.unknownTenant")}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: t("admin.operations.statusColumn"),
      render: (job) => (
        <StatusBadge
          variant={
            job.status === "dead_letter"
              ? "destructive"
              : job.status === "failed"
                ? "warning"
                : "info"
          }
        >
          {translateJobStatus(job.status)}
        </StatusBadge>
      ),
    },
    {
      key: "attempts",
      header: t("admin.operations.attemptsColumn"),
      render: (job) => `${job.attempts}/${job.max_attempts}`,
    },
    {
      key: "error_class",
      header: "Failure class",
      render: (job) => (
        <div className="space-y-1">
          <StatusBadge
            variant={job.error_class === "permanent" ? "destructive" : job.error_class === "transient" ? "warning" : "default"}
          >
            {job.error_class ?? "unclassified"}
          </StatusBadge>
          <p className="text-xs text-muted-foreground">
            {job.initiated_as ? `Initiated as ${job.initiated_as.replace("_", " ")}` : "Initiator not recorded"}
          </p>
        </div>
      ),
    },
    {
      key: "last_error",
      header: t("admin.operations.lastErrorColumn"),
      render: (job) => (
        <div className="max-w-[320px] space-y-1">
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {job.last_error || t("admin.operations.noErrorMessage")}
          </p>
          <p className="text-xs text-muted-foreground">
            {job.error_code ? `Code: ${job.error_code}` : "No error code"}
          </p>
        </div>
      ),
    },
    {
      key: "updated_at",
      header: t("admin.dashboard.updated"),
      render: (job) => (
        <div className="space-y-1">
          <p>{formatDate(job.updated_at, locale, "datetime")}</p>
          <p className="text-xs text-muted-foreground">
            {job.last_attempt_at
              ? t("admin.operations.lastAttempt", { date: formatDate(job.last_attempt_at, locale, "datetime") })
              : t("admin.operations.noAttemptTimestamp")}
          </p>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (job) => {
        const retryable = job.status === "dead_letter" || Boolean(job.last_error);
        if (!retryable) return null;

        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setJobRetryTarget({ ids: [job.id], tenantName: job.tenant_name })}
          >
            <RotateCcw className="h-4 w-4" />
            Retry
          </Button>
        );
      },
    },
  ];

  const systemErrorColumns: Column<AdminRecentSystemError>[] = [
    {
      key: "service",
      header: t("admin.operations.serviceColumn"),
      render: (log) => (
        <div>
          <p className="font-medium">{log.service}</p>
          <p className="text-xs text-muted-foreground">{log.tenant_name || t("admin.common.platformWide")}</p>
        </div>
      ),
    },
    {
      key: "level",
      header: t("admin.operations.levelColumn"),
      render: (log) => (
        <StatusBadge variant={log.level === "error" ? "destructive" : "warning"}>
          {translateLogLevel(log.level)}
        </StatusBadge>
      ),
    },
    {
      key: "message",
      header: t("admin.operations.messageColumn"),
      render: (log) => (
        <span className="line-clamp-2 max-w-[360px] text-sm text-muted-foreground">
          {log.message}
        </span>
      ),
    },
    {
      key: "created_at",
      header: t("admin.dashboard.created"),
      render: (log) => formatDate(log.created_at, locale, "datetime"),
    },
  ];

  const adminActivityColumns: Column<AdminRecentActivity>[] = [
    {
      key: "action_type",
      header: "Action",
      render: (entry) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="font-medium">{entry.action_type.replace(/_/g, " ")}</p>
            <StatusBadge variant={entry.is_global ? "info" : "default"}>
              {entry.is_global ? "Global" : entry.tenant_name ?? "Tenant"}
            </StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground">
            {entry.actor_name ?? entry.actor_id}
          </p>
        </div>
      ),
    },
    {
      key: "resource_type",
      header: "Resource",
      render: (entry) => (
        <div className="space-y-1">
          <p className="font-medium">{entry.resource_type}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {entry.resource_id ?? "No resource id"}
          </p>
        </div>
      ),
    },
    {
      key: "request_id",
      header: "Request",
      render: (entry) => (
        <div className="space-y-1">
          <p className="font-mono text-xs">{entry.request_id ?? "No request id"}</p>
          <p className="text-xs text-muted-foreground">
            {entry.metadata
              && typeof (entry.metadata as Record<string, unknown>).reason === "string"
              && ((entry.metadata as Record<string, unknown>).reason as string).trim().length > 0
              ? ((entry.metadata as Record<string, unknown>).reason as string)
              : entry.action}
          </p>
        </div>
      ),
    },
    {
      key: "created_at",
      header: t("admin.dashboard.created"),
      render: (entry) => formatDate(entry.created_at, locale, "datetime"),
    },
  ];

  const planCounts = subscriptionStats?.plan_counts ?? {};
  const totalPlanCount = PLAN_OPTIONS.reduce((sum, plan) => sum + Number((planCounts as any)[plan] ?? 0), 0);

  const planBreakdown = PLAN_OPTIONS.map((plan) => {
    const count = Number((planCounts as any)[plan] ?? 0);
    const pct = totalPlanCount ? Math.round((count / totalPlanCount) * 100) : 0;
    const variant = plan === "pro" ? "success" : plan === "enterprise" ? "info" : plan === "starter" ? "warning" : "default";
    return { plan, count, pct, variant };
  });

  const trendPoints = operationsDashboard?.client_error_trend ?? [];
  const trendMax = trendPoints.reduce((max, point) => Math.max(max, point.error_count), 0);
  const authTrendPoints = operationsDashboard?.auth_metric_trend ?? [];
  const authTrendMax = authTrendPoints.reduce((max, point) => Math.max(max, point.metric_count), 0);
  const loginSuccessRate = formatRate(
    operationsSummary?.recent_auth_login_success_count ?? 0,
    operationsSummary?.recent_auth_login_failure_count ?? 0,
    locale,
  );
  const refreshSuccessRate = formatRate(
    operationsSummary?.recent_auth_refresh_success_count ?? 0,
    operationsSummary?.recent_auth_refresh_failure_count ?? 0,
    locale,
  );
  const recoverySuccessRate = formatRate(
    operationsSummary?.recent_auth_recovery_success_count ?? 0,
    operationsSummary?.recent_auth_recovery_failure_count ?? 0,
    locale,
  );

  return (
    <div className="min-h-screen bg-background" dir={locale === "ar" ? "rtl" : "ltr"}>
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <HeartPulse className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-foreground">{t("admin.nav.brand")}</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Crown className="h-3 w-3" /> {t("admin.nav.role")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/ops/runtime">Runtime ops</Link>
            </Button>
            <LanguageSwitcher />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                {user?.name?.charAt(0) || "A"}
              </div>
              <span className="text-sm font-medium">{user?.name}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} aria-label={t("admin.nav.logout")} title={t("admin.nav.logout")}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Tabs */}
        <div className="border-b flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <Button
              key={tab.key}
              type="button"
              data-testid={`admin-tab-${tab.key}`}
              variant="ghost"
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={cn(
                "h-auto rounded-none flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title={t("admin.dashboard.totalClinics")} value={formatNumber(totalClinics, locale)} icon={Building2} accent="primary" />
              <StatCard title={t("admin.dashboard.totalUsers")} value={formatNumber(totalUsers, locale)} icon={Users} accent="info" />
              <StatCard title={t("admin.dashboard.activeSubscriptions")} value={formatNumber(activeSubs, locale)} icon={CreditCard} accent="success" />
              <StatCard title={t("admin.dashboard.monthlyRevenue")} value={formatCurrency(totalRevenue, locale, "EGP")} icon={TrendingUp} accent="warning" />
            </div>

            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{t("admin.dashboard.operationsAlerts")}</h3>
                    <StatusBadge variant={operationsSeverityVariant as "success" | "warning" | "destructive"}>
                      {translateSeverity(operationsDashboard?.overall_severity)}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("admin.dashboard.operationsAlertsDescription")}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("admin.dashboard.alertWindow")}
                </p>
              </div>

              {loadingOperationsDashboard ? (
                <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                  {t("admin.dashboard.loadingOperationsTelemetry")}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <StatCard
                      title={t("admin.operations.pendingJobs")}
                      value={formatNumber(operationsSummary?.pending_jobs_count ?? 0, locale)}
                      icon={Activity}
                      accent={(operationsSummary?.pending_jobs_count ?? 0) >= 20 ? "warning" : "info"}
                      subtitle={t("admin.common.processingCount", {
                        count: formatNumber(operationsSummary?.processing_jobs_count ?? 0, locale),
                      })}
                    />
                    <StatCard
                      title={t("admin.operations.retryingJobs")}
                      value={formatNumber(operationsSummary?.retrying_jobs_count ?? 0, locale)}
                      icon={AlertTriangle}
                      accent={(operationsSummary?.retrying_jobs_count ?? 0) > 0 ? "warning" : "success"}
                      subtitle={t("admin.common.workerFailuresCount", {
                        count: formatNumber(operationsSummary?.recent_job_failures_count ?? 0, locale),
                      })}
                    />
                    <StatCard
                      title={t("admin.operations.deadLetters")}
                      value={formatNumber(operationsSummary?.dead_letter_jobs_count ?? 0, locale)}
                      icon={Server}
                      accent={(operationsSummary?.dead_letter_jobs_count ?? 0) > 0 ? "destructive" : "success"}
                      subtitle={t("admin.common.stuckProcessingCount", {
                        count: formatNumber(operationsSummary?.stale_processing_jobs_count ?? 0, locale),
                      })}
                    />
                    <StatCard
                      title={t("admin.operations.edgeFailures")}
                      value={formatNumber(operationsSummary?.recent_edge_failures_count ?? 0, locale)}
                      icon={BarChart3}
                      accent={(operationsSummary?.recent_edge_failures_count ?? 0) > 0 ? "destructive" : "success"}
                      subtitle={t("admin.common.clientErrorsCount", {
                        count: formatNumber(operationsSummary?.recent_client_errors_count ?? 0, locale),
                      })}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                    <StatCard
                      title={t("admin.operations.loginSuccessRate")}
                      value={loginSuccessRate}
                      icon={Shield}
                      accent={(operationsSummary?.recent_auth_login_failure_count ?? 0) > 0 ? "warning" : "success"}
                      subtitle={t("admin.common.failuresCount", {
                        count: formatNumber(operationsSummary?.recent_auth_login_failure_count ?? 0, locale),
                      })}
                    />
                    <StatCard
                      title={t("admin.operations.refreshSuccessRate")}
                      value={refreshSuccessRate}
                      icon={RotateCcw}
                      accent={(operationsSummary?.recent_auth_refresh_failure_count ?? 0) >= 3 ? "destructive" : "success"}
                      subtitle={t("admin.common.failuresCount", {
                        count: formatNumber(operationsSummary?.recent_auth_refresh_failure_count ?? 0, locale),
                      })}
                    />
                    <StatCard
                      title={t("admin.operations.recoverySuccessRate")}
                      value={recoverySuccessRate}
                      icon={Activity}
                      accent={(operationsSummary?.recent_auth_recovery_failure_count ?? 0) > 0 ? "warning" : "success"}
                      subtitle={t("admin.common.failuresCount", {
                        count: formatNumber(operationsSummary?.recent_auth_recovery_failure_count ?? 0, locale),
                      })}
                    />
                    <StatCard
                      title={t("admin.operations.authAnomalies")}
                      value={formatNumber(
                        (operationsSummary?.recent_auth_drift_count ?? 0)
                          + (operationsSummary?.recent_stale_auth_rejects_count ?? 0)
                          + (operationsSummary?.recent_auth_replay_rejects_count ?? 0),
                        locale,
                      )}
                      icon={AlertTriangle}
                      accent={
                        ((operationsSummary?.recent_auth_drift_count ?? 0)
                          + (operationsSummary?.recent_auth_replay_rejects_count ?? 0)) > 0
                          ? "destructive"
                          : (operationsSummary?.recent_stale_auth_rejects_count ?? 0) > 0
                            ? "warning"
                            : "success"
                      }
                      subtitle={t("admin.common.lastAuthSignal", {
                        date: operationsSummary?.last_auth_signal_at
                          ? formatDate(operationsSummary.last_auth_signal_at, locale, "datetime")
                          : t("admin.operations.noAuthSignals"),
                      })}
                    />
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-sm font-medium">{t("admin.operations.activeSignals")}</h4>
                      {operationsDashboard?.active_alerts.length ? (
                        <span className="text-xs text-muted-foreground">
                          {t("admin.common.activeAlerts", {
                            count: operationsDashboard.active_alerts.length,
                          })}
                        </span>
                      ) : null}
                    </div>

                    {operationsDashboard?.active_alerts.length ? (
                      <div className="mt-3 space-y-3">
                        {operationsDashboard.active_alerts.map((alert) => (
                          <div key={alert.key} className="flex flex-col gap-2 rounded-lg border bg-background p-3 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{alert.title}</span>
                                <StatusBadge
                                  variant={
                                    alert.severity === "critical"
                                      ? "destructive"
                                      : alert.severity === "warning"
                                        ? "warning"
                                        : "success"
                                  }
                                  dot
                                >
                                  {translateSeverity(alert.severity)}
                                </StatusBadge>
                              </div>
                              <p className="text-sm text-muted-foreground">{alert.description}</p>
                            </div>
                            <div className="text-sm font-semibold">{alert.count}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        {t("admin.dashboard.noActiveAlerts")}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Recent clinics */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t("admin.dashboard.recentClinics")}</h3>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("clinics")}>
                  {t("admin.dashboard.viewAllClinics")} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <DataTable
                columns={recentClinicColumns}
                data={recentTenants}
                keyExtractor={(t) => t.id}
                emptyMessage={t("admin.dashboard.recentClinicsEmpty")}
                tableLabel={t("admin.dashboard.recentClinicsTable")}
                onRowClick={(t) => void handleImpersonateTenant({ id: t.id, slug: t.slug, name: t.name })}
              />
            </div>

            {/* Subscription breakdown - all 4 plans */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {planBreakdown.map(({ plan, count, pct, variant }) => (
                <div key={plan} className="bg-card rounded-xl border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium capitalize">{t("admin.common.planBreakdown", { plan: translatePlan(plan) })}</span>
                    <StatusBadge variant={variant as any}>{formatNumber(count, locale)}</StatusBadge>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className="h-2 bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{t("admin.common.percentOfTotal", { percentage: pct })}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "operations" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold">{t("admin.operations.drillDownTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("admin.operations.drillDownDescription")}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={operationsTenantFilter} onValueChange={setOperationsTenantFilter}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder={t("admin.operations.allTenants")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("admin.operations.allTenants")}</SelectItem>
                    {recentTenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={retryableJobs.length === 0}
                  onClick={() => setJobRetryTarget({
                    ids: retryableJobs.map((job) => job.id),
                    tenantName: operationsTenantId
                      ? recentTenants.find((tenant) => tenant.id === operationsTenantId)?.name
                      : null,
                  })}
                >
                  <RotateCcw className="h-4 w-4" />
                  Retry visible jobs
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                title={t("admin.operations.pendingJobs")}
                value={formatNumber(operationsSummary?.pending_jobs_count ?? 0, locale)}
                icon={Activity}
                accent={(operationsSummary?.pending_jobs_count ?? 0) >= 20 ? "warning" : "info"}
                subtitle={t("admin.common.processingCount", {
                  count: formatNumber(operationsSummary?.processing_jobs_count ?? 0, locale),
                })}
              />
              <StatCard
                title={t("admin.operations.retryingJobs")}
                value={formatNumber(operationsSummary?.retrying_jobs_count ?? 0, locale)}
                icon={AlertTriangle}
                accent={(operationsSummary?.retrying_jobs_count ?? 0) > 0 ? "warning" : "success"}
                subtitle={t("admin.common.workerFailuresCount", {
                  count: formatNumber(operationsSummary?.recent_job_failures_count ?? 0, locale),
                })}
              />
              <StatCard
                title={t("admin.operations.recentEdgeFailures")}
                value={formatNumber(operationsSummary?.recent_edge_failures_count ?? 0, locale)}
                icon={Server}
                accent={(operationsSummary?.recent_edge_failures_count ?? 0) > 0 ? "destructive" : "success"}
                subtitle={operationsSummary?.last_edge_failure_at
                  ? formatDate(operationsSummary.last_edge_failure_at, locale, "datetime")
                  : t("admin.operations.noRecentFailures")}
              />
              <StatCard
                title={t("admin.operations.recentClientErrors")}
                value={formatNumber(operationsSummary?.recent_client_errors_count ?? 0, locale)}
                icon={BarChart3}
                accent={(operationsSummary?.recent_client_errors_count ?? 0) >= 5 ? "warning" : "info"}
                subtitle={operationsSummary?.last_client_error_at
                  ? formatDate(operationsSummary.last_client_error_at, locale, "datetime")
                  : t("admin.operations.noRecentClientErrors")}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <StatCard
                title={t("admin.operations.loginSuccessRate")}
                value={loginSuccessRate}
                icon={Shield}
                accent={(operationsSummary?.recent_auth_login_failure_count ?? 0) > 0 ? "warning" : "success"}
                subtitle={t("admin.common.failuresCount", {
                  count: formatNumber(operationsSummary?.recent_auth_login_failure_count ?? 0, locale),
                })}
              />
              <StatCard
                title={t("admin.operations.refreshSuccessRate")}
                value={refreshSuccessRate}
                icon={RotateCcw}
                accent={(operationsSummary?.recent_auth_refresh_failure_count ?? 0) >= 3 ? "destructive" : "success"}
                subtitle={t("admin.common.failuresCount", {
                  count: formatNumber(operationsSummary?.recent_auth_refresh_failure_count ?? 0, locale),
                })}
              />
              <StatCard
                title={t("admin.operations.recoverySuccessRate")}
                value={recoverySuccessRate}
                icon={Activity}
                accent={(operationsSummary?.recent_auth_recovery_failure_count ?? 0) > 0 ? "warning" : "success"}
                subtitle={t("admin.common.failuresCount", {
                  count: formatNumber(operationsSummary?.recent_auth_recovery_failure_count ?? 0, locale),
                })}
              />
              <StatCard
                title={t("admin.operations.authAnomalies")}
                value={formatNumber(
                  (operationsSummary?.recent_auth_drift_count ?? 0)
                    + (operationsSummary?.recent_stale_auth_rejects_count ?? 0)
                    + (operationsSummary?.recent_auth_replay_rejects_count ?? 0)
                    + (operationsSummary?.recent_unexpected_logouts_count ?? 0),
                  locale,
                )}
                icon={AlertTriangle}
                accent={
                  ((operationsSummary?.recent_auth_drift_count ?? 0)
                    + (operationsSummary?.recent_auth_replay_rejects_count ?? 0)
                    + (operationsSummary?.recent_auth_queue_overflows_count ?? 0)) > 0
                    ? "destructive"
                    : (operationsSummary?.recent_stale_auth_rejects_count ?? 0) > 0
                      ? "warning"
                      : "success"
                }
                subtitle={t("admin.common.driftReplayRejects", {
                  drift: formatNumber(operationsSummary?.recent_auth_drift_count ?? 0, locale),
                  replay: formatNumber(operationsSummary?.recent_auth_replay_rejects_count ?? 0, locale),
                })}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 rounded-2xl border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{t("admin.operations.recentJobFailures")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.operations.recentJobFailuresDescription")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {operationsTenantId ? (
                      <StatusBadge variant="default">
                        {recentTenants.find((tenant) => tenant.id === operationsTenantId)?.name ?? "Tenant filter"}
                      </StatusBadge>
                    ) : null}
                    <StatusBadge variant={operationsSeverityVariant as "success" | "warning" | "destructive"}>
                      {translateSeverity(operationsDashboard?.overall_severity)}
                    </StatusBadge>
                  </div>
                </div>

                <DataTable
                  columns={jobActivityColumns}
                  data={failedJobsFeed}
                  keyExtractor={(job) => job.id}
                  emptyMessage={t("admin.operations.recentJobFailuresEmpty")}
                  tableLabel={t("admin.operations.recentJobFailuresTable")}
                />
              </div>

              <div className="rounded-2xl border bg-card p-5 space-y-4">
                <div>
                  <h3 className="font-semibold">{t("admin.operations.clientErrorTrend")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.operations.clientErrorTrendDescription")}
                  </p>
                </div>

                <div className="space-y-3">
                  {trendPoints.length ? (
                    trendPoints.map((point: AdminClientErrorTrendPoint) => {
                      const width = trendMax > 0 ? Math.max(8, Math.round((point.error_count / trendMax) * 100)) : 8;
                      return (
                        <div key={point.bucket_start} className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatTrendBucketLabel(point.bucket_start, locale)}</span>
                            <span>{t("admin.common.errorsAndTenants", {
                              errors: formatNumber(point.error_count, locale),
                              tenants: formatNumber(point.affected_tenants_count, locale),
                            })}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-primary transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("admin.operations.clientErrorTrendEmpty")}</p>
                  )}
                </div>

                <div className="border-t pt-4 space-y-3">
                  <div>
                    <h3 className="font-semibold">{t("admin.operations.authMetricTrend")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t("admin.operations.authMetricTrendDescription")}
                    </p>
                  </div>
                  {authTrendPoints.length ? (
                    authTrendPoints.map((point: AdminAuthMetricTrendPoint) => {
                      const width = authTrendMax > 0 ? Math.max(8, Math.round((point.metric_count / authTrendMax) * 100)) : 8;
                      return (
                        <div key={point.bucket_start} className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatTrendBucketLabel(point.bucket_start, locale)}</span>
                            <span>{t("admin.common.authMetricsAndFailures", {
                              metrics: formatNumber(point.metric_count, locale),
                              failures: formatNumber(point.failure_count, locale),
                            })}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className={cn(
                                "h-2 rounded-full transition-all",
                                point.failure_count > 0 ? "bg-destructive" : "bg-primary",
                              )}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("admin.operations.authMetricTrendEmpty")}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div>
                <h3 className="font-semibold">{t("admin.operations.recentSystemErrors")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("admin.operations.recentSystemErrorsDescription")}
                </p>
              </div>

              <DataTable
                columns={systemErrorColumns}
                data={operationsDashboard?.recent_system_errors ?? []}
                keyExtractor={(log) => log.id}
                emptyMessage={t("admin.operations.recentSystemErrorsEmpty")}
                tableLabel={t("admin.operations.recentSystemErrorsTable")}
              />
            </div>

            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{t("admin.operations.activityStreamTitle")}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t("admin.operations.activityStreamDescription")}
                  </p>
                </div>
                {operationsTenantId ? (
                  <StatusBadge variant="default">
                    {recentTenants.find((tenant) => tenant.id === operationsTenantId)?.name ?? "Tenant filter"}
                  </StatusBadge>
                ) : null}
              </div>

              <DataTable
                columns={adminActivityColumns}
                data={recentAdminActivity}
                keyExtractor={(entry) => entry.id}
                emptyMessage={loadingRecentAdminActivity ? "Loading recent admin activity..." : "No recent admin activity."}
                tableLabel="Recent admin activity"
                isLoading={loadingRecentAdminActivity}
              />
            </div>
          </div>
        )}

        {/* Clinics Tab */}
        {activeTab === "clinics" && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold">{t("admin.clinics.title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("admin.clinics.description")}
                </p>
              </div>
              <Button onClick={openCreateTenant} className="shrink-0" data-testid="admin-create-tenant-trigger">
                <Plus className="h-4 w-4" />
                {t("admin.clinics.createTenant")}
              </Button>
            </div>
            <DataTable
              columns={clinicColumns}
              data={tenants}
              keyExtractor={(c) => c.id}
              searchable
              serverSearch
              searchValue={clinicSearch}
              onSearchChange={setClinicSearch}
              isLoading={loadingTenants}
              exportFileName="clinics"
              page={clinicPage}
              pageSize={pageSize}
              total={tenantsResponse?.total}
              onPageChange={setClinicPage}
              sortColumn={clinicSort.column}
              sortDirection={clinicSort.direction}
              onSortChange={(column, direction) => setClinicSort({ column: column as "name" | "created_at", direction })}
              filterSlot={
                <StatusFilter
                  options={PLAN_OPTIONS.map((p) => ({ value: p, label: translatePlan(p) }))}
                  selected={clinicFilter}
                  onChange={setClinicFilter}
                />
              }
            />
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="animate-fade-in">
            <DataTable
              columns={userColumns}
              data={profiles}
              keyExtractor={(p) => p.id}
              searchable
              serverSearch
              searchValue={userSearch}
              onSearchChange={setUserSearch}
              isLoading={loadingProfiles}
              exportFileName="users"
              page={userPage}
              pageSize={pageSize}
              total={profilesResponse?.total}
              onPageChange={setUserPage}
              sortColumn={userSort.column}
              sortDirection={userSort.direction}
              onSortChange={(column, direction) => setUserSort({ column: column as "full_name" | "created_at", direction })}
            />
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === "subscriptions" && (
          <div className="animate-fade-in">
            <DataTable
              columns={subColumns}
              data={subscriptions}
              keyExtractor={(s) => s.id}
              searchable
              serverSearch
              searchValue={subSearch}
              onSearchChange={setSubSearch}
              isLoading={loadingSubs}
              exportFileName="subscriptions"
              page={subPage}
              pageSize={pageSize}
              total={subscriptionsResponse?.total}
              onPageChange={setSubPage}
              sortColumn={subSort.column}
              sortDirection={subSort.direction}
              onSortChange={(column, direction) => setSubSort({ column: column as typeof subSort.column, direction })}
              filterSlot={
                <StatusFilter
                  options={PLAN_OPTIONS.map((p) => ({ value: p, label: translatePlan(p) }))}
                  selected={subFilter}
                  onChange={setSubFilter}
                />
              }
            />
          </div>
        )}

        {activeTab === "pricing" && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold">{t("admin.pricing.title")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("admin.pricing.description")}
                </p>
              </div>
              <Button
                onClick={openCreatePricingPlan}
                disabled={availablePlanCodes.length === 0}
                className="shrink-0"
                data-testid="admin-create-pricing-plan-trigger"
              >
                <Plus className="h-4 w-4" />
                {t("admin.pricing.createPlan")}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                title={t("admin.pricing.catalogPlans")}
                value={formatNumber(pricingPlans.length, locale)}
                icon={CreditCard}
                accent="info"
                subtitle={t("admin.common.publicPlansCount", {
                  count: pricingPlans.filter((plan) => plan.is_public).length,
                })}
              />
              <StatCard
                title={t("admin.pricing.popularPlans")}
                value={formatNumber(pricingPlans.filter((plan) => plan.is_popular).length, locale)}
                icon={TrendingUp}
                accent="warning"
                subtitle={t("admin.pricing.highlightedInPublicPricing")}
              />
              <StatCard
                title={t("admin.pricing.enterpriseCta")}
                value={formatNumber(pricingPlans.filter((plan) => plan.is_enterprise_contact).length, locale)}
                icon={Crown}
                accent="success"
                subtitle={t("admin.pricing.contactSalesPlanCards")}
              />
              <StatCard
                title={t("admin.pricing.missingSlots")}
                value={formatNumber(availablePlanCodes.length, locale)}
                icon={AlertTriangle}
                accent={availablePlanCodes.length > 0 ? "warning" : "success"}
                subtitle={availablePlanCodes.length > 0
                  ? t("admin.pricing.canonicalPlanCodeAvailable")
                  : t("admin.pricing.catalogComplete")}
              />
            </div>

            {loadingPricingPlans ? (
              <div className="rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
                {t("admin.pricing.loadingCatalog")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {pricingPlans.map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-2xl border bg-card p-5 space-y-4"
                    data-testid={`admin-pricing-card-${plan.plan_code}`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{plan.name}</h3>
                          <StatusBadge variant="default">{translatePlan(plan.plan_code)}</StatusBadge>
                          {plan.is_popular ? <StatusBadge variant="warning">{t("admin.pricing.popularBadge")}</StatusBadge> : null}
                          {!plan.is_public ? <StatusBadge variant="destructive">{t("admin.pricing.hiddenBadge")}</StatusBadge> : null}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {plan.description || t("admin.common.notConfiguredYet")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditPricingPlan(plan)}
                          data-testid={`admin-pricing-edit-${plan.plan_code}`}
                        >
                          <Pencil className="h-4 w-4" />
                          {t("admin.pricing.editPlan")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPricingDeletePlan(plan)}
                          data-testid={`admin-pricing-delete-${plan.plan_code}`}
                        >
                          <Trash2 className="h-4 w-4" />
                          {t("admin.pricing.deletePlan")}
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-2">
                      <div>
                        <div className="text-xs text-muted-foreground">{t("admin.pricing.monthlyPrice")}</div>
                        <div className="font-medium">{formatCurrency(Number(plan.monthly_price), locale, plan.currency)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t("admin.pricing.annualPrice")}</div>
                        <div className="font-medium">{formatCurrency(Number(plan.annual_price), locale, plan.currency)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t("admin.pricing.defaultCycle")}</div>
                        <div className="font-medium capitalize">{translateCycle(plan.default_billing_cycle)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">{t("admin.pricing.doctorLimitLabel")}</div>
                        <div className="font-medium">{plan.doctor_limit_label}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">{t("admin.pricing.features")}</h4>
                        <span className="text-xs text-muted-foreground">
                          {t("admin.common.orderValue", { count: plan.display_order })} • {t("admin.common.featureCount", { count: plan.features.length })}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {plan.features.map((feature) => (
                          <span key={feature} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                {pricingPlans.length === 0 ? (
                  <div className="rounded-2xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
                    {t("admin.pricing.empty")}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirm dialog for subscription changes */}
      <ConfirmDialog
        open={!!confirmAction}
        title={t("admin.dialogs.confirmSubscriptionChangeTitle")}
        message={confirmAction
          ? t("admin.dialogs.confirmSubscriptionChangeMessage", {
            field: translateField(confirmAction.field),
            value: confirmAction.field === "plan"
              ? translatePlan(confirmAction.value)
              : confirmAction.field === "billing_cycle"
                ? translateCycle(confirmAction.value)
                : translateSubscriptionStatus(confirmAction.value),
          })
          : ""}
        confirmLabel={t("admin.dialogs.updateAction")}
        cancelLabel={t("common.cancel")}
        variant="warning"
        loading={actionLoading}
        onConfirm={handleSubUpdate}
        onCancel={() => setConfirmAction(null)}
      />

      <PricingPlanDialog
        open={pricingDialogOpen}
        mode={pricingDialogMode}
        plan={editingPricingPlan}
        availablePlanCodes={availablePlanCodes}
        saving={pricingSaveLoading}
        onClose={() => {
          setPricingDialogOpen(false);
          setEditingPricingPlan(null);
        }}
        onSubmit={handlePricingPlanSubmit}
      />

      <TenantFormDialog
        open={tenantDialogOpen}
        mode={tenantDialogMode}
        tenant={editingTenant}
        saving={tenantSaveLoading}
        onClose={() => {
          setTenantDialogOpen(false);
          setEditingTenant(null);
        }}
        onSubmit={handleTenantSubmit}
      />

      <TenantModulesDialog
        open={!!tenantModulesTarget}
        tenant={tenantModulesTarget}
        flags={tenantFeatureFlags}
        loading={loadingTenantFeatureFlags}
        savingFeatureKey={tenantModuleSavingKey}
        onClose={() => setTenantModulesTarget(null)}
        onToggle={handleTenantModuleToggle}
      />

      <TenantStatusDialog
        open={!!tenantStatusTarget}
        tenant={tenantStatusTarget?.tenant ?? null}
        targetStatus={tenantStatusTarget?.status ?? null}
        saving={tenantStatusLoading}
        onClose={() => setTenantStatusTarget(null)}
        onSubmit={handleTenantStatusSubmit}
      />

      <TenantUsageDialog
        open={!!tenantUsageTarget}
        tenant={tenantUsageTarget}
        usage={tenantUsage ?? null}
        loading={loadingTenantUsage}
        onClose={() => setTenantUsageTarget(null)}
      />

      <JobRetryDialog
        open={!!jobRetryTarget}
        jobCount={jobRetryTarget?.ids.length ?? 0}
        tenantName={jobRetryTarget?.tenantName}
        loading={jobRetryLoading}
        onClose={() => setJobRetryTarget(null)}
        onSubmit={handleRetryJobs}
      />

      <ConfirmDialog
        open={!!pricingDeletePlan}
        title={t("admin.dialogs.deletePricingPlanTitle")}
        message={pricingDeletePlan
          ? t("admin.dialogs.deletePricingPlanMessage", { name: pricingDeletePlan.name })
          : ""}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        loading={pricingDeleteLoading}
        onConfirm={handleDeletePricingPlan}
        onCancel={() => setPricingDeletePlan(null)}
      />
    </div>
  );
};


