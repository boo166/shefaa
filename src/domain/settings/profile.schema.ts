import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { uuidSchema } from "../shared/identifiers.schema";
import { appRoleEnum } from "./roles.schema";

export const profileSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  tenant_id: uuidSchema,
  full_name: z.string().trim().min(1).max(200),
  avatar_url: z.string().trim().min(1).max(500).optional().nullable(),
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(200).optional(),
  avatar_url: z.string().trim().min(1).max(500).optional().nullable(),
});

export const profileWithRolesSchema = profileSchema.extend({
  user_roles: z.array(z.object({ role: appRoleEnum })).optional(),
});
