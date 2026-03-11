import type { z } from "zod";
import { auditLogSchema } from "./audit.schema";

export type AuditLog = z.infer<typeof auditLogSchema>;
