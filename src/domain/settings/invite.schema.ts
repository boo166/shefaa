import { z } from "zod";
import { appRoleEnum } from "./roles.schema";

export const inviteStaffSchema = z.object({
  email: z.string().trim().email(),
  full_name: z.string().trim().min(1).max(200),
  role: appRoleEnum,
});
