import type { ProfileWithRoles } from "@/domain/settings/profile.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const PROFILE_COLUMNS = "id, user_id, tenant_id, full_name, avatar_url, created_at, updated_at";

export interface SettingsUsersRepository {
  listProfilesWithRoles(tenantId: string): Promise<ProfileWithRoles[]>;
}

export const settingsUsersRepository: SettingsUsersRepository = {
  async listProfilesWithRoles(tenantId) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("tenant_id", tenantId)
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
      ...(profile as any),
      user_roles: rolesByUserId.get(profile.user_id) ?? [],
    }));
  },
};
