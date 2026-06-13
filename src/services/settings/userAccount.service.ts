import { supabase } from "@/services/supabase/client";
import { toServiceError } from "@/services/supabase/errors";
import { assertAnyPermission } from "@/services/supabase/permissions";

export const userAccountService = {
  async suspendUser(targetUserId: string, reason?: string) {
    try {
      assertAnyPermission(["manage_clinic", "manage_users"], "Only clinic admins can suspend users");
      const { error } = await supabase.rpc("clinic_suspend_user", {
        p_target_user_id: targetUserId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    } catch (err) {
      throw toServiceError(err, "Failed to suspend user");
    }
  },

  async reactivateUser(targetUserId: string, reason?: string) {
    try {
      assertAnyPermission(["manage_clinic", "manage_users"], "Only clinic admins can reactivate users");
      const { error } = await supabase.rpc("clinic_reactivate_user", {
        p_target_user_id: targetUserId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    } catch (err) {
      throw toServiceError(err, "Failed to reactivate user");
    }
  },
};
