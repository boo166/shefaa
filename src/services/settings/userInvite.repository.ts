import type { InviteStaffInput } from "@/domain/settings/invite.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

export interface UserInviteRepository {
  inviteStaff(input: InviteStaffInput): Promise<void>;
}

export const userInviteRepository: UserInviteRepository = {
  async inviteStaff(input) {
    const { data, error } = await supabase.functions.invoke("invite-staff", { body: input });
    if (error || (data as any)?.error) {
      throw new ServiceError(error?.message ?? (data as any)?.error ?? "Failed to invite staff", {
        code: error?.name,
        details: error ?? data,
      });
    }
  },
};
