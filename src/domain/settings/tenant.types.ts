import type { z } from "zod";
import { tenantSchema, tenantUpdateSchema } from "./tenant.schema";

export type Tenant = z.infer<typeof tenantSchema>;
export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;
