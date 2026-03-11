import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const notificationPreferencesSchema = z.object({
  id: uuidSchema,
  user_id: uuidSchema,
  tenant_id: uuidSchema,
  appointment_reminders: z.boolean(),
  lab_results_ready: z.boolean(),
  billing_alerts: z.boolean(),
  system_updates: z.boolean(),
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const notificationPreferencesUpdateSchema = z.object({
  appointment_reminders: z.boolean().optional(),
  lab_results_ready: z.boolean().optional(),
  billing_alerts: z.boolean().optional(),
  system_updates: z.boolean().optional(),
});
