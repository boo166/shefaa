import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const adminTenantSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  created_at: dateTimeStringSchema,
});

export const subscriptionPlanEnum = z.enum(["free", "starter", "pro", "enterprise"]);
export const subscriptionStatusEnum = z.enum(["active", "trialing", "expired", "canceled"]);

export const adminSubscriptionSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  plan: subscriptionPlanEnum,
  status: subscriptionStatusEnum,
  amount: z.coerce.number().min(0),
  currency: z.string().trim().min(1).max(10),
  billing_cycle: z.string().trim().min(1).max(30),
  expires_at: dateTimeStringSchema.optional().nullable(),
  created_at: dateTimeStringSchema,
  tenants: z
    .object({
      name: z.string().trim().min(1).max(200),
      slug: z.string().trim().min(1).max(120),
    })
    .optional()
    .nullable(),
});

export const adminSubscriptionUpdateSchema = z.object({
  plan: subscriptionPlanEnum.optional(),
  status: subscriptionStatusEnum.optional(),
});
