import { z } from "zod";
import { appointmentStatusEnum, appointmentTypeEnum } from "@/domain/appointment/appointment.schema";
import { dateTimeStringSchema } from "@/domain/shared/date.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";

export const appointmentQueueStatusEnum = z.enum([
  "waiting",
  "called",
  "in_service",
  "done",
  "no_show",
]);

export const appointmentQueueSchema = z.object({
  id: uuidSchema,
  appointment_id: uuidSchema,
  tenant_id: uuidSchema,
  check_in_at: dateTimeStringSchema,
  position: z.number().int().nullable(),
  status: appointmentQueueStatusEnum,
  called_at: dateTimeStringSchema.optional().nullable(),
  completed_at: dateTimeStringSchema.optional().nullable(),
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema.optional(),
});

export const appointmentQueueWithRelationsSchema = appointmentQueueSchema.extend({
  appointments: z.object({
    id: uuidSchema,
    appointment_date: dateTimeStringSchema,
    duration_minutes: z.number().int().min(1).max(1440),
    type: appointmentTypeEnum,
    status: appointmentStatusEnum,
    patients: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
    doctors: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
  }).optional().nullable(),
});
