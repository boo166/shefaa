import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema } from "../shared/date.schema";
import { listParamsSchema } from "../shared/pagination.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const prescriptionStatusEnum = z.enum(["active", "completed"]);

export const prescriptionSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  patient_id: uuidSchema,
  doctor_id: uuidSchema,
  medication: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(200),
  status: prescriptionStatusEnum,
  prescribed_date: dateStringSchema,
  created_at: dateTimeStringSchema,
});

export const prescriptionWithDoctorSchema = prescriptionSchema.extend({
  doctors: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
});

export const prescriptionCreateSchema = prescriptionSchema
  .omit({
    id: true,
    tenant_id: true,
    created_at: true,
  })
  .extend({
    status: prescriptionStatusEnum.optional(),
    prescribed_date: dateStringSchema.optional(),
  });

export const prescriptionUpdateSchema = prescriptionCreateSchema.partial();

export const prescriptionListParamsSchema = listParamsSchema;
