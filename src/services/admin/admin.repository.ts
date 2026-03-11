import type { AdminSubscription, AdminTenant } from "@/domain/admin/admin.types";
import type { ProfileWithRoles } from "@/domain/settings/profile.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const TENANT_COLUMNS = "id, name, slug, email, phone, created_at";
const SUBSCRIPTION_COLUMNS =
  "id, tenant_id, plan, status, amount, currency, billing_cycle, expires_at, created_at, tenants(name, slug)";
const PROFILE_COLUMNS = "id, user_id, tenant_id, full_name, avatar_url, created_at, updated_at";

export interface AdminRepository {
  listTenants(): Promise<AdminTenant[]>;
  listProfilesWithRoles(): Promise<ProfileWithRoles[]>;
  listSubscriptions(): Promise<AdminSubscription[]>;
  updateSubscription(id: string, input: Partial<Pick<AdminSubscription, "plan" | "status">>): Promise<AdminSubscription>;
}

export const adminRepository: AdminRepository = {
  async listTenants() {
    const { data, error } = await supabase
      .from("tenants")
      .select(TENANT_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load tenants", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AdminTenant[];
  },
  async listProfilesWithRoles() {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .order("created_at", { ascending: false });

    if (profilesError) {
      throw new ServiceError(profilesError.message ?? "Failed to load profiles", {
        code: profilesError.code,
        details: profilesError,
      });
    }

    if (!profiles?.length) {
      return [];
    }

    const userIds = profiles.map((profile) => profile.user_id);
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds);

    if (rolesError) {
      throw new ServiceError(rolesError.message ?? "Failed to load user roles", {
        code: rolesError.code,
        details: rolesError,
      });
    }

    const rolesByUserId = new Map<string, ProfileWithRoles["user_roles"]>();

    for (const role of roles ?? []) {
      rolesByUserId.set(role.user_id, [{ role: role.role }]);
    }

    return profiles.map((profile) => ({
      ...profile,
      user_roles: rolesByUserId.get(profile.user_id) ?? [],
    })) as ProfileWithRoles[];
  },
  async listSubscriptions() {
    const { data, error } = await supabase
      .from("subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .order("created_at", { ascending: false });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load subscriptions", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AdminSubscription[];
  },
  async updateSubscription(id, input) {
    const payload: Record<string, unknown> = {};
    if (input.plan !== undefined) payload.plan = input.plan;
    if (input.status !== undefined) payload.status = input.status;

    if (Object.keys(payload).length === 0) {
      const { data, error } = await supabase
        .from("subscriptions")
        .select(SUBSCRIPTION_COLUMNS)
        .eq("id", id)
        .single();

      if (error) {
        throw new ServiceError(error.message ?? "Failed to load subscription", {
          code: error.code,
          details: error,
        });
      }

      return data as AdminSubscription;
    }

    const { data, error } = await supabase
      .from("subscriptions")
      .update(payload)
      .eq("id", id)
      .select(SUBSCRIPTION_COLUMNS)
      .single();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update subscription", {
        code: error.code,
        details: error,
      });
    }

    return data as AdminSubscription;
  },
};
