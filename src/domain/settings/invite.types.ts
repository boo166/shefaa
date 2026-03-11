import type { z } from "zod";
import { inviteStaffSchema } from "./invite.schema";

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
