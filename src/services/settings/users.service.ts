import { z } from "zod";
import { profileWithRolesSchema } from "@/domain/settings/profile.schema";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { settingsUsersRepository } from "./users.repository";

export const settingsUsersService = {
  async listProfilesWithRoles() {
    try {
      const { tenantId } = getTenantContext();
      const result = await settingsUsersRepository.listProfilesWithRoles(tenantId);
      return z.array(profileWithRolesSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load users");
    }
  },
};
