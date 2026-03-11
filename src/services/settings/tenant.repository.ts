import type { Tenant, TenantUpdateInput } from "@/domain/settings/tenant.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const TENANT_COLUMNS = "id, slug, name, phone, email, address, logo_url, created_at, updated_at";

export interface TenantRepository {
  getById(tenantId: string): Promise<Tenant>;
  update(tenantId: string, input: TenantUpdateInput): Promise<Tenant>;
}

export const tenantRepository: TenantRepository = {
  async getById(tenantId) {
    const result = await supabase
      .from("tenants")
      .select(TENANT_COLUMNS)
      .eq("id", tenantId)
      .single();

    return assertOk(result) as Tenant;
  },
  async update(tenantId, input) {
    const payload: Record<string, unknown> = {};

    if (input.name !== undefined) payload.name = input.name;
    if (input.phone !== undefined) payload.phone = input.phone;
    if (input.email !== undefined) payload.email = input.email;
    if (input.address !== undefined) payload.address = input.address;
    if (input.logo_url !== undefined) payload.logo_url = input.logo_url;

    if (Object.keys(payload).length === 0) {
      const result = await supabase
        .from("tenants")
        .select(TENANT_COLUMNS)
        .eq("id", tenantId)
        .single();
      return assertOk(result) as Tenant;
    }

    const { data, error } = await supabase
      .from("tenants")
      .update(payload)
      .eq("id", tenantId)
      .select(TENANT_COLUMNS)
      .single();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update tenant", {
        code: error.code,
        details: error,
      });
    }

    return data as Tenant;
  },
};
