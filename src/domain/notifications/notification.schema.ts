import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const notificationSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional().nullable(),
  type: z.string().trim().min(1).max(50),
  read: z.boolean(),
  created_at: dateTimeStringSchema,
  delivery_key: z.string().trim().min(1).nullable().optional(),
  source_event_id: uuidSchema.nullable().optional(),
  source_outbox_id: uuidSchema.nullable().optional(),
  delivered_at: dateTimeStringSchema.nullable().optional(),
  acknowledged_at: dateTimeStringSchema.nullable().optional(),
  updated_at: dateTimeStringSchema.nullable().optional(),
});

export const notificationMarkReadSchema = z.object({
  id: uuidSchema,
});

export const notificationCreateSchema = z.object({
  tenant_id: uuidSchema,
  user_id: uuidSchema,
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional().nullable(),
  type: z.string().trim().min(1).max(50),
  read: z.boolean().optional(),
});
