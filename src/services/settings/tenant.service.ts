import { tenantSchema, tenantUpdateSchema } from "@/domain/settings/tenant.schema";
import type { TenantUpdateInput } from "@/domain/settings/tenant.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { tenantRepository } from "./tenant.repository";

export const tenantService = {
  async getCurrentTenant() {
    try {
      const { tenantId } = getTenantContext();
      const result = await tenantRepository.getById(tenantId);
      return tenantSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load tenant information");
    }
  },
  async updateCurrentTenant(input: TenantUpdateInput) {
    try {
      const parsed = tenantUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await tenantRepository.update(tenantId, parsed);
      return tenantSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to update tenant information");
    }
  },
};
