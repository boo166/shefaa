import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const auditLogSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  user_id: uuidSchema,
  action: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: uuidSchema.optional().nullable(),
  details: z.record(z.unknown()).optional().nullable(),
  ip_address: z.string().optional().nullable(),
  created_at: dateTimeStringSchema,
});
