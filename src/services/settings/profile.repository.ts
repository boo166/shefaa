import type { Profile, ProfileUpdateInput } from "@/domain/settings/profile.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const PROFILE_COLUMNS = "id, user_id, tenant_id, full_name, avatar_url, created_at, updated_at";

export interface ProfileRepository {
  updateByUserId(userId: string, tenantId: string, input: ProfileUpdateInput): Promise<Profile>;
}

export const profileRepository: ProfileRepository = {
  async updateByUserId(userId, tenantId, input) {
    const payload: Record<string, unknown> = {};

    if (input.full_name !== undefined) payload.full_name = input.full_name;
    if (input.avatar_url !== undefined) payload.avatar_url = input.avatar_url;

    if (Object.keys(payload).length === 0) {
      const result = await supabase
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as Profile;
    }

    const result = await supabase
      .from("profiles")
      .update(payload)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .select(PROFILE_COLUMNS)
      .single();

    const { data, error } = result;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update profile", {
        code: error.code,
        details: error,
      });
    }

    return data as Profile;
  },
};
