import type { z } from "zod";
import {
  adminSubscriptionSchema,
  adminSubscriptionUpdateSchema,
  adminTenantSchema,
} from "./admin.schema";

export type AdminTenant = z.infer<typeof adminTenantSchema>;
export type AdminSubscription = z.infer<typeof adminSubscriptionSchema>;
export type AdminSubscriptionUpdateInput = z.infer<typeof adminSubscriptionUpdateSchema>;
