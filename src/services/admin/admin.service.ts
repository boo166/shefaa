import { z } from "zod";
import {
  adminSubscriptionSchema,
  adminSubscriptionUpdateSchema,
  adminTenantSchema,
} from "@/domain/admin/admin.schema";
import type { AdminSubscriptionUpdateInput } from "@/domain/admin/admin.types";
import { profileWithRolesSchema } from "@/domain/settings/profile.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import { toServiceError } from "@/services/supabase/errors";
import { adminRepository } from "./admin.repository";

export const adminService = {
  async listTenants() {
    try {
      const result = await adminRepository.listTenants();
      return z.array(adminTenantSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load tenants");
    }
  },
  async listProfilesWithRoles() {
    try {
      const result = await adminRepository.listProfilesWithRoles();
      return z.array(profileWithRolesSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load profiles");
    }
  },
  async listSubscriptions() {
    try {
      const result = await adminRepository.listSubscriptions();
      return z.array(adminSubscriptionSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load subscriptions");
    }
  },
  async updateSubscription(id: string, input: AdminSubscriptionUpdateInput) {
    try {
      const parsedId = uuidSchema.parse(id);
      const parsed = adminSubscriptionUpdateSchema.parse(input);
      const result = await adminRepository.updateSubscription(parsedId, parsed);
      return adminSubscriptionSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to update subscription");
    }
  },
};
