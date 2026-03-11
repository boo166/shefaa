import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

export const securityService = {
  async updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update password", {
        code: error.code,
        details: error,
      });
    }
  },
};
