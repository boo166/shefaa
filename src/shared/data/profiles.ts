import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type ProfileWithRole = Tables<"profiles"> & {
  user_roles: Array<Pick<Tables<"user_roles">, "role">>;
};

interface FetchProfilesWithRolesOptions {
  tenantId?: string;
}

export async function fetchProfilesWithRoles(
  options: FetchProfilesWithRolesOptions = {}
): Promise<ProfileWithRole[]> {
  let profilesQuery = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (options.tenantId) {
    profilesQuery = profilesQuery.eq("tenant_id", options.tenantId);
  }

  const { data: profiles, error: profilesError } = await profilesQuery;

  if (profilesError) {
    throw profilesError;
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
    throw rolesError;
  }

  const rolesByUserId = new Map<string, ProfileWithRole["user_roles"]>();

  for (const role of roles ?? []) {
    rolesByUserId.set(role.user_id, [{ role: role.role }]);
  }

  return profiles.map((profile) => ({
    ...profile,
    user_roles: rolesByUserId.get(profile.user_id) ?? [],
  }));
}
