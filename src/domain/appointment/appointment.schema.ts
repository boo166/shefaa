import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { listParamsSchema } from "../shared/pagination.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const appointmentTypeEnum = z.enum([
  "checkup",
  "follow_up",
  "consultation",
  "emergency",
]);

export const appointmentStatusEnum = z.enum([
  "scheduled",
  "in_progress",
  "completed",
  "cancelled",
]);

export const appointmentSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  patient_id: uuidSchema,
  doctor_id: uuidSchema,
  appointment_date: dateTimeStringSchema,
  duration_minutes: z.number().int().min(1).max(1440),
  type: appointmentTypeEnum,
  status: appointmentStatusEnum,
  notes: z.string().trim().max(2000).optional().nullable(),
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const appointmentWithDoctorSchema = appointmentSchema.extend({
  doctors: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
});

export const appointmentWithPatientDoctorSchema = appointmentSchema.extend({
  patients: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
  doctors: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
});

export const appointmentCreateSchema = appointmentSchema
  .omit({
    id: true,
    tenant_id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    status: appointmentStatusEnum.optional(),
    duration_minutes: z.number().int().min(1).max(1440).optional(),
  });

export const appointmentUpdateSchema = appointmentCreateSchema.partial();

export const appointmentListParamsSchema = listParamsSchema;
