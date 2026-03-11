import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema } from "../shared/date.schema";
import { listParamsSchema } from "../shared/pagination.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const labStatusEnum = z.enum(["pending", "processing", "completed"]);

export const labResultSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  patient_id: uuidSchema,
  doctor_id: uuidSchema,
  test_name: z.string().trim().min(1).max(200),
  order_date: dateStringSchema,
  status: labStatusEnum,
  result: z.string().trim().max(2000).optional().nullable(),
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const labOrderWithDoctorSchema = labResultSchema.extend({
  doctors: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
});

export const labOrderWithPatientDoctorSchema = labResultSchema.extend({
  patients: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
  doctors: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
});

export const labResultCreateSchema = labResultSchema
  .omit({
    id: true,
    tenant_id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    status: labStatusEnum.optional(),
    order_date: dateStringSchema.optional(),
  });

export const labResultUpdateSchema = labResultCreateSchema.partial();

export const labResultListParamsSchema = listParamsSchema;
