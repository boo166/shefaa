import type {
  AdminJobRetryInput,
  AdminAuthMetricTrendPoint,
  AdminClientErrorTrendPoint,
  AdminMutationContext,
  AdminOperationsAlertSummary,
  AdminPricingPlan,
  AdminRecentActivity,
  AdminRecentJobActivity,
  AdminRecentSystemError,
  AdminSubscription,
  AdminTenant,
  AdminTenantCreateInput,
  AdminTenantStatusUpdateInput,
  AdminTenantUpdateInput,
  AdminSubscriptionStats,
  AdminTenantUsage,
} from "@/domain/admin/admin.types";
import type { ProfileWithRoles } from "@/domain/settings/profile.types";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

function adminCtx(action: string, classification: PlatformRepositoryContext["classification"] = "critical", tenantId?: string | null): PlatformRepositoryContext {
  return {
    action,
    classification,
    tenantScoped: Boolean(tenantId),
    tenantId: tenantId ?? null,
    requiredCapabilities: ["platform.super_admin"],
  };
}

const TENANT_COLUMNS =
  "id, name, slug, email, phone, address, pending_owner_email, status, status_reason, status_changed_at, created_at, subscriptions(plan, status)";
const SUBSCRIPTION_COLUMNS =
  "id, tenant_id, plan, status, amount, currency, billing_cycle, expires_at, created_at, tenants(name, slug)";
const PROFILE_COLUMNS = "id, user_id, tenant_id, full_name, avatar_url, created_at, updated_at, tenants(name, slug)";
const PRICING_PLAN_COLUMNS =
  "id, plan_code, name, description, doctor_limit_label, features, monthly_price, annual_price, currency, default_billing_cycle, is_popular, is_public, is_enterprise_contact, display_order, created_at, updated_at, deleted_at";

type TenantSort = { column: "name" | "created_at"; ascending?: boolean };
type ProfileSort = { column: "full_name" | "created_at"; ascending?: boolean };
type SubscriptionSort = { column: "plan" | "status" | "amount" | "expires_at" | "created_at"; ascending?: boolean };

function mapTenantRow(row: any): AdminTenant {
  const subscription = Array.isArray(row?.subscriptions) ? row.subscriptions[0] : row?.subscriptions;
  return {
    ...row,
    plan: subscription?.plan ?? row?.plan ?? null,
    status: subscription?.status ?? row?.status ?? null,
    tenant_status: row?.tenant_status ?? row?.status ?? "active",
    status_reason: row?.status_reason ?? null,
    status_changed_at: row?.status_changed_at ?? null,
  } as AdminTenant;
}

export interface AdminRepository {
  listTenantsPaged(params: {
    limit: number;
    offset: number;
    search?: string;
    plan?: AdminSubscription["plan"];
    sort?: TenantSort;
  }): Promise<{ data: AdminTenant[]; count: number }>;
  createTenant(input: AdminTenantCreateInput, context?: AdminMutationContext, reason?: string): Promise<AdminTenant>;
  updateTenant(id: string, input: AdminTenantUpdateInput, context?: AdminMutationContext, reason?: string): Promise<AdminTenant>;
  updateTenantStatus(id: string, input: AdminTenantStatusUpdateInput, context?: AdminMutationContext): Promise<AdminTenant>;
  updateTenantFeatureFlag(
    tenantId: string,
    featureKey: string,
    enabled: boolean,
    context?: AdminMutationContext,
  ): Promise<{ id: string; feature_key: string; enabled: boolean }>;
  listProfilesWithRolesPaged(params: {
    limit: number;
    offset: number;
    search?: string;
    sort?: ProfileSort;
  }): Promise<{ data: ProfileWithRoles[]; count: number }>;
  listSubscriptionsPaged(params: {
    limit: number;
    offset: number;
    search?: string;
    plan?: AdminSubscription["plan"];
    status?: AdminSubscription["status"];
    sort?: SubscriptionSort;
  }): Promise<{ data: AdminSubscription[]; count: number }>;
  listPricingPlans(): Promise<AdminPricingPlan[]>;
  createPricingPlan(
    input: Omit<AdminPricingPlan, "id" | "created_at" | "updated_at" | "deleted_at">,
    context?: AdminMutationContext,
  ): Promise<AdminPricingPlan>;
  updatePricingPlan(
    id: string,
    input: Partial<Omit<AdminPricingPlan, "id" | "created_at" | "updated_at" | "deleted_at">>,
    context?: AdminMutationContext,
  ): Promise<AdminPricingPlan>;
  deletePricingPlan(id: string, context?: AdminMutationContext): Promise<void>;
  updateSubscription(
    id: string,
    input: Partial<Pick<AdminSubscription, "plan" | "status" | "billing_cycle">>,
    context?: AdminMutationContext,
  ): Promise<AdminSubscription>;
  getSubscriptionStats(): Promise<AdminSubscriptionStats>;
  getOperationsAlertSummary(tenantId?: string): Promise<AdminOperationsAlertSummary>;
  getRecentJobActivity(limit?: number, tenantId?: string): Promise<AdminRecentJobActivity[]>;
  getRecentActivity(limit?: number, tenantId?: string): Promise<AdminRecentActivity[]>;
  getRecentSystemErrors(limit?: number, tenantId?: string): Promise<AdminRecentSystemError[]>;
  getClientErrorTrend(bucketMinutes?: number, bucketCount?: number, tenantId?: string): Promise<AdminClientErrorTrendPoint[]>;
  getAuthMetricTrend(bucketMinutes?: number, bucketCount?: number, tenantId?: string): Promise<AdminAuthMetricTrendPoint[]>;
  getTenantUsage(tenantId: string): Promise<AdminTenantUsage>;
  retryJobs(input: AdminJobRetryInput & AdminMutationContext): Promise<AdminRecentJobActivity[]>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

async function selectTenantById(id: string) {
  const { data, error } = await platformRepository
    .from("tenants", adminCtx("admin.selectTenantById", "readonly"))
    .select(TENANT_COLUMNS)
    .eq("id", id)
    .single();

  if (error) {
    throw new ServiceError(error.message ?? "Failed to load tenant", {
      code: error.code,
      details: error,
    });
  }

  return mapTenantRow({ ...(data as any), tenant_status: (data as any).status ?? "active" });
}

async function selectPricingPlanById(id: string) {
  const { data, error } = await platformRepository
    .from("pricing_plans", adminCtx("admin.selectPricingPlanById", "readonly"))
    .select(PRICING_PLAN_COLUMNS)
    .eq("id", id)
    .single();

  if (error) {
    throw new ServiceError(error.message ?? "Failed to load pricing plan", {
      code: error.code,
      details: error,
    });
  }

  return data as unknown as AdminPricingPlan;
}

async function selectSubscriptionById(id: string) {
  const { data, error } = await platformRepository
    .from("subscriptions", adminCtx("admin.selectSubscriptionById", "readonly"))
    .select(SUBSCRIPTION_COLUMNS)
    .eq("id", id)
    .single();

  if (error) {
    throw new ServiceError(error.message ?? "Failed to load subscription", {
      code: error.code,
      details: error,
    });
  }

  return data as unknown as AdminSubscription;
}

export const adminRepository: AdminRepository = {
  async listTenantsPaged({ limit, offset, search, plan, sort }) {
    const to = Math.max(0, offset + limit - 1);
    const sortColumn = sort?.column ?? "created_at";
    const ascending = sort?.ascending ?? false;

    if (plan) {
      let planQuery = platformRepository
        .from("subscriptions", adminCtx("admin.listTenantsPaged.byPlan", "readonly"))
        .select("plan, status, tenants(id, name, slug, email, phone, address, pending_owner_email, status, status_reason, status_changed_at, created_at)", { count: "exact" })
        .eq("plan", plan)
        .range(offset, to);

      if (search && search.trim().length > 0) {
        const q = `%${search.trim()}%`;
        planQuery = planQuery.or(`tenants.name.ilike.${q},tenants.slug.ilike.${q},tenants.email.ilike.${q}`);
      }

      planQuery = planQuery.order(sortColumn === "name" ? "name" : "created_at", {
        ascending,
        foreignTable: "tenants",
      });

      const { data, error, count } = await planQuery;
      if (error) {
        throw new ServiceError(error.message ?? "Failed to load tenants", {
          code: error.code,
          details: error,
        });
      }

      const mapped = (data ?? [])
        .map((row: any) => {
          if (!row?.tenants) return null;
          return mapTenantRow({
            ...row.tenants,
            plan: row.plan ?? null,
            status: row.status ?? null,
            tenant_status: row.tenants.status ?? "active",
          });
        })
        .filter(Boolean) as AdminTenant[];

      return { data: mapped, count: count ?? 0 };
    }

    let query = platformRepository
      .from("tenants", adminCtx("admin.listTenantsPaged", "readonly"))
      .select(TENANT_COLUMNS, { count: "exact" })
      .range(offset, to);

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      query = query.or(`name.ilike.${q},slug.ilike.${q},email.ilike.${q}`);
    }

    query = query.order(sortColumn === "name" ? "name" : "created_at", { ascending });

    const { data, error, count } = await query;

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load tenants", {
        code: error.code,
        details: error,
      });
    }

    const mapped = (data ?? []).map((row: any) => mapTenantRow({ ...row, tenant_status: row.status ?? "active" }));

    return { data: mapped, count: count ?? 0 };
  },
  async createTenant(input, context, reason) {
    const { data, error } = await platformRepository.rpc("admin_create_tenant", {
      _name: input.name,
      _slug: input.slug,
      _email: input.email ?? null,
      _phone: input.phone ?? null,
      _address: input.address ?? null,
      _pending_owner_email: input.pending_owner_email ?? null,
      _request_id: context?.requestId ?? null,
      _reason: reason ?? null,
      _idempotency_key: context?.idempotencyKey ?? null,
      _step_up_grant_id: context?.stepUpGrantId ?? null,
    }, adminCtx("admin.createTenant", "critical"));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to create tenant", {
        code: error.code,
        details: error,
      });
    }

    return await selectTenantById(data as string);
  },
  async updateTenant(id, input, context, reason) {
    const current = await selectTenantById(id);
    const { data, error } = await platformRepository.rpc("admin_update_tenant", {
      _tenant_id: id,
      _name: input.name ?? current.name,
      _slug: input.slug ?? current.slug,
      _email: input.email ?? current.email ?? null,
      _phone: input.phone ?? current.phone ?? null,
      _address: input.address ?? current.address ?? null,
      _pending_owner_email: input.pending_owner_email ?? current.pending_owner_email ?? null,
      _request_id: context?.requestId ?? null,
      _reason: reason ?? null,
      _idempotency_key: context?.idempotencyKey ?? null,
      _step_up_grant_id: context?.stepUpGrantId ?? null,
    }, adminCtx("admin.updateTenant", "critical", null));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update tenant", {
        code: error.code,
        details: error,
      });
    }

    return await selectTenantById(data as string);
  },
  async updateTenantStatus(id, input, context) {
    const { data, error } = await platformRepository.rpc("admin_update_tenant_status", {
      _tenant_id: id,
      _status: input.status,
      _status_reason: input.status_reason ?? null,
      _request_id: context?.requestId ?? null,
      _idempotency_key: context?.idempotencyKey ?? null,
      _step_up_grant_id: context?.stepUpGrantId ?? null,
    }, adminCtx("admin.updateTenantStatus", "critical", null));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update tenant status", {
        code: error.code,
        details: error,
      });
    }

    return await selectTenantById(data as string);
  },
  async updateTenantFeatureFlag(tenantId, featureKey, enabled, context) {
    const { data, error } = await platformRepository.rpc("admin_upsert_tenant_feature_flag", {
      _tenant_id: tenantId,
      _feature_key: featureKey,
      _enabled: enabled,
      _request_id: context?.requestId ?? null,
      _idempotency_key: context?.idempotencyKey ?? null,
      _step_up_grant_id: context?.stepUpGrantId ?? null,
    }, adminCtx("admin.updateTenantFeatureFlag", "critical", null));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update tenant feature flag", {
        code: error.code,
        details: error,
      });
    }

    const { data: row, error: rowError } = await platformRepository
      .from("feature_flags", adminCtx("admin.selectTenantFeatureFlag", "readonly", tenantId))
      .select("id, feature_key, enabled")
      .eq("id", data as string)
      .single();

    if (rowError) {
      throw new ServiceError(rowError.message ?? "Failed to load tenant feature flag", {
        code: rowError.code,
        details: rowError,
      });
    }

    return row as unknown as { id: string; feature_key: string; enabled: boolean };
  },
  async listProfilesWithRolesPaged({ limit, offset, search, sort }) {
    const to = Math.max(0, offset + limit - 1);
    const sortColumn = sort?.column ?? "created_at";
    const ascending = sort?.ascending ?? false;
    let profilesQuery = platformRepository
      .from("profiles", adminCtx("admin.listProfilesWithRolesPaged", "readonly"))
      .select(PROFILE_COLUMNS, { count: "exact" })
      .range(offset, to);
    profilesQuery = profilesQuery.order(sortColumn, { ascending });

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      profilesQuery = profilesQuery.ilike("full_name", q);
    }

    const { data: profiles, error: profilesError, count } = await profilesQuery;

    if (profilesError) {
      throw new ServiceError(profilesError.message ?? "Failed to load profiles", {
        code: profilesError.code,
        details: profilesError,
      });
    }

    if (!profiles?.length) {
      return { data: [], count: count ?? 0 };
    }

    const userIds = profiles.map((profile: any) => profile.user_id);
    const { data: roles, error: rolesError } = await platformRepository
      .from("user_roles", adminCtx("admin.listProfilesWithRolesPaged.userRoles", "readonly"))
      .select("user_id, role")
      .in("user_id", userIds);

    if (rolesError) {
      throw new ServiceError(rolesError.message ?? "Failed to load user roles", {
        code: rolesError.code,
        details: rolesError,
      });
    }

    const { data: globalRoles, error: globalRolesError } = await (platformRepository.from as any)(
      "user_global_roles",
      adminCtx("admin.listProfilesWithRolesPaged.globalRoles", "readonly"),
    )
      .select("user_id, role")
      .in("user_id", userIds)
      .is("revoked_at", null);

    if (globalRolesError) {
      throw new ServiceError(globalRolesError.message ?? "Failed to load global roles", {
        code: globalRolesError.code,
        details: globalRolesError,
      });
    }

    const rolesByUserId = new Map<string, ProfileWithRoles["user_roles"]>();

    for (const role of (roles ?? []) as any[]) {
      const currentRoles = rolesByUserId.get(role.user_id) ?? [];
      rolesByUserId.set(role.user_id, [...currentRoles, { role: role.role }]);
    }

    for (const role of (globalRoles ?? []) as any[]) {
      const currentRoles = rolesByUserId.get(role.user_id) ?? [];
      rolesByUserId.set(role.user_id, [...currentRoles, { role: role.role }]);
    }

    const data = (profiles as any[]).map((profile) => ({
      ...(profile as any),
      user_roles: rolesByUserId.get(profile.user_id) ?? [],
    })) as ProfileWithRoles[];

    return { data, count: count ?? 0 };
  },
  async listSubscriptionsPaged({ limit, offset, search, plan, status, sort }) {
    const to = Math.max(0, offset + limit - 1);
    const sortColumn = sort?.column ?? "created_at";
    const ascending = sort?.ascending ?? false;
    let query = platformRepository
      .from("subscriptions", adminCtx("admin.listSubscriptionsPaged", "readonly"))
      .select(SUBSCRIPTION_COLUMNS, { count: "exact" })
      .range(offset, to);

    if (plan) {
      query = query.eq("plan", plan);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      query = query.or(`tenants.name.ilike.${q},tenants.slug.ilike.${q}`);
    }

    query = query.order(sortColumn, { ascending });

    const { data, error, count } = await query;

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load subscriptions", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as unknown as AdminSubscription[], count: count ?? 0 };
  },
  async listPricingPlans() {
    const { data, error } = await platformRepository
      .from("pricing_plans", adminCtx("admin.listPricingPlans", "readonly"))
      .select(PRICING_PLAN_COLUMNS)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .order("plan_code", { ascending: true });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load pricing plans", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as unknown as AdminPricingPlan[];
  },
  async createPricingPlan(input, context) {
    const { data, error } = await platformRepository.rpc("admin_create_pricing_plan", {
      _plan_code: input.plan_code,
      _name: input.name,
      _description: input.description ?? null,
      _doctor_limit_label: input.doctor_limit_label,
      _features: input.features,
      _monthly_price: input.monthly_price,
      _annual_price: input.annual_price,
      _currency: input.currency,
      _default_billing_cycle: input.default_billing_cycle,
      _is_popular: input.is_popular,
      _is_public: input.is_public,
      _is_enterprise_contact: input.is_enterprise_contact,
      _display_order: input.display_order,
      _request_id: context?.requestId ?? null,
      _idempotency_key: context?.idempotencyKey ?? null,
      _step_up_grant_id: context?.stepUpGrantId ?? null,
    }, adminCtx("admin.createPricingPlan", "critical"));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to create pricing plan", {
        code: error.code,
        details: error,
      });
    }

    return await selectPricingPlanById(data as string);
  },
  async updatePricingPlan(id, input, context) {
    if (Object.keys(input).length === 0) {
      return await selectPricingPlanById(id);
    }

    const { data, error } = await platformRepository.rpc("admin_update_pricing_plan", {
      _plan_id: id,
      _name: input.name ?? null,
      _description: input.description ?? null,
      _doctor_limit_label: input.doctor_limit_label ?? null,
      _features: input.features ?? null,
      _monthly_price: input.monthly_price ?? null,
      _annual_price: input.annual_price ?? null,
      _currency: input.currency ?? null,
      _default_billing_cycle: input.default_billing_cycle ?? null,
      _is_popular: input.is_popular ?? null,
      _is_public: input.is_public ?? null,
      _is_enterprise_contact: input.is_enterprise_contact ?? null,
      _display_order: input.display_order ?? null,
      _request_id: context?.requestId ?? null,
      _idempotency_key: context?.idempotencyKey ?? null,
      _step_up_grant_id: context?.stepUpGrantId ?? null,
    }, adminCtx("admin.updatePricingPlan", "critical"));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update pricing plan", {
        code: error.code,
        details: error,
      });
    }

    return await selectPricingPlanById(data as string);
  },
  async deletePricingPlan(id, context) {
    const { error } = await platformRepository.rpc("admin_delete_pricing_plan", {
      _plan_id: id,
      _request_id: context?.requestId ?? null,
      _idempotency_key: context?.idempotencyKey ?? null,
      _step_up_grant_id: context?.stepUpGrantId ?? null,
    }, adminCtx("admin.deletePricingPlan", "critical"));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to delete pricing plan", {
        code: error.code,
        details: error,
      });
    }
  },
  async getSubscriptionStats() {
    const { data, error } = await platformRepository.rpc(
      "admin_subscription_stats",
      {},
      adminCtx("admin.subscriptionStats", "readonly"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load subscription stats", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? {}) as AdminSubscriptionStats;
  },
  async getOperationsAlertSummary(tenantId?: string) {
    const { data, error } = await platformRepository.rpc("admin_operations_alert_summary", {
      _tenant_id: tenantId ?? null,
    }, adminCtx("admin.operationsAlertSummary", "readonly", tenantId ?? null));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load operations alert summary", {
        code: error.code,
        details: error,
      });
    }

    if (Array.isArray(data)) {
      return ((data[0] ?? {}) as AdminOperationsAlertSummary);
    }

    return ((data ?? {}) as AdminOperationsAlertSummary);
  },
  async getRecentJobActivity(limit = 10, tenantId?: string) {
    const { data, error } = await platformRepository.rpc("admin_recent_job_activity", {
      _limit: limit,
      _tenant_id: tenantId ?? null,
    }, adminCtx("admin.recentJobActivity", "readonly", tenantId ?? null));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load recent job activity", {
        code: error.code,
        details: error,
      });
    }

    return (Array.isArray(data) ? data : []) as AdminRecentJobActivity[];
  },
  async getRecentActivity(limit = 20, tenantId?: string) {
    const { data, error } = await platformRepository.rpc("admin_recent_activity", {
      _limit: limit,
      _tenant_id: tenantId ?? null,
    }, adminCtx("admin.recentActivity", "readonly", tenantId ?? null));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load recent admin activity", {
        code: error.code,
        details: error,
      });
    }

    return (Array.isArray(data) ? data : []) as AdminRecentActivity[];
  },
  async getRecentSystemErrors(limit = 10, tenantId?: string) {
    const { data, error } = await platformRepository.rpc("admin_recent_system_errors", {
      _limit: limit,
      _tenant_id: tenantId ?? null,
    }, adminCtx("admin.recentSystemErrors", "readonly", tenantId ?? null));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load recent system errors", {
        code: error.code,
        details: error,
      });
    }

    return (Array.isArray(data) ? data : []) as AdminRecentSystemError[];
  },
  async getClientErrorTrend(bucketMinutes = 15, bucketCount = 6, tenantId?: string) {
    const { data, error } = await platformRepository.rpc("admin_client_error_trend", {
      _bucket_minutes: bucketMinutes,
      _bucket_count: bucketCount,
      _tenant_id: tenantId ?? null,
    }, adminCtx("admin.clientErrorTrend", "readonly", tenantId ?? null));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load client error trend", {
        code: error.code,
        details: error,
      });
    }

    return (Array.isArray(data) ? data : []) as AdminClientErrorTrendPoint[];
  },
  async getAuthMetricTrend(bucketMinutes = 15, bucketCount = 6, tenantId?: string) {
    const { data, error } = await platformRepository.rpc("admin_auth_metric_trend", {
      _bucket_minutes: bucketMinutes,
      _bucket_count: bucketCount,
      _tenant_id: tenantId ?? null,
    }, adminCtx("admin.authMetricTrend", "readonly", tenantId ?? null));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load auth metric trend", {
        code: error.code,
        details: error,
      });
    }

    return (Array.isArray(data) ? data : []) as AdminAuthMetricTrendPoint[];
  },
  async updateSubscription(id, input, context) {
    if (Object.keys(input).length === 0) {
      return await selectSubscriptionById(id);
    }

    const { data, error } = await platformRepository.rpc("admin_update_subscription", {
      _subscription_id: id,
      _plan: input.plan ?? null,
      _status: input.status ?? null,
      _billing_cycle: input.billing_cycle ?? null,
      _request_id: context?.requestId ?? null,
      _idempotency_key: context?.idempotencyKey ?? null,
      _step_up_grant_id: context?.stepUpGrantId ?? null,
    }, adminCtx("admin.updateSubscription", "critical"));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update subscription", {
        code: error.code,
        details: error,
      });
    }

    return await selectSubscriptionById(data as string);
  },
  async getTenantUsage(tenantId) {
    const { data, error } = await platformRepository.rpc("admin_tenant_usage_summary", {
      _tenant_id: tenantId,
    }, adminCtx("admin.tenantUsage", "tenant-critical", tenantId));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load tenant usage", {
        code: error.code,
        details: error,
      });
    }

    return ((Array.isArray(data) ? data[0] : data) ?? {}) as AdminTenantUsage;
  },
  async retryJobs(input) {
    const { data, error } = await platformRepository.rpc("admin_retry_jobs", {
      _job_ids: input.job_ids,
      _request_id: input.requestId,
      _reason: input.reason,
      _idempotency_key: input.idempotencyKey,
      _step_up_grant_id: input.stepUpGrantId ?? null,
    }, adminCtx("admin.retryJobs", "critical", null));

    if (error) {
      throw new ServiceError(error.message ?? "Failed to retry jobs", {
        code: error.code,
        details: error,
      });
    }

    return (Array.isArray(data) ? data : []) as AdminRecentJobActivity[];
  },
  describe() {
    return {
      certified: false,
      tenantBound: false,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: false,
      recoveryAware: true,
      evidenceAware: false,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: ["platform.super_admin"],
    };
  },
};
