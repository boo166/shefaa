import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { listParamsSchema } from "../shared/pagination.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const doctorStatusEnum = z.enum(["available", "busy", "on_leave"]);

const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(20)
  .regex(/^[0-9+().\-\s]+$/)
  .optional()
  .nullable();

const emailSchema = z.string().trim().email().optional().nullable();

export const doctorSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema.optional().nullable(),
  full_name: z.string().trim().min(2).max(120),
  specialty: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  email: emailSchema,
  rating: z.number().min(0).max(5).optional().nullable(),
  status: doctorStatusEnum,
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const doctorCreateSchema = doctorSchema
  .omit({
    id: true,
    tenant_id: true,
    user_id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    status: doctorStatusEnum.optional(),
    rating: z.number().min(0).max(5).optional().nullable(),
  });

export const doctorUpdateSchema = doctorCreateSchema.partial();

export const doctorListParamsSchema = listParamsSchema;
