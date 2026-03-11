import { profileSchema, profileUpdateSchema } from "@/domain/settings/profile.schema";
import type { ProfileUpdateInput } from "@/domain/settings/profile.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { profileRepository } from "./profile.repository";

export const profileService = {
  async updateProfile(userId: string, input: ProfileUpdateInput) {
    try {
      const parsed = profileUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await profileRepository.updateByUserId(userId, tenantId, parsed);
      return profileSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to update profile");
    }
  },
};
