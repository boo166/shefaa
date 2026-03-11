import { inviteStaffSchema } from "@/domain/settings/invite.schema";
import type { InviteStaffInput } from "@/domain/settings/invite.types";
import { toServiceError } from "@/services/supabase/errors";
import { userInviteRepository } from "./userInvite.repository";

export const userInviteService = {
  async inviteStaff(input: InviteStaffInput) {
    try {
      const parsed = inviteStaffSchema.parse(input);
      await userInviteRepository.inviteStaff(parsed);
    } catch (err) {
      throw toServiceError(err, "Failed to invite staff");
    }
  },
};
