import type { Medication, MedicationCreateInput, MedicationListParams, MedicationSummary, MedicationUpdateInput } from "@/domain/pharmacy/medication.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const MEDICATION_COLUMNS =
  "id, tenant_id, name, category, stock, unit, price, status, created_at, updated_at";

const SEARCH_COLUMNS = ["name", "category", "status", "unit"];
const SORTABLE_COLUMNS = new Set(["created_at", "updated_at", "name", "stock", "price", "status"]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

export interface PharmacyRepository {
  listPaged(params: MedicationListParams, tenantId: string): Promise<PagedResult<Medication>>;
  getSummary(tenantId: string): Promise<MedicationSummary>;
  create(input: MedicationCreateInput, tenantId: string): Promise<Medication>;
  update(id: string, input: MedicationUpdateInput, tenantId: string): Promise<Medication>;
  remove(id: string, tenantId: string): Promise<void>;
}

export const pharmacyRepository: PharmacyRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("medications")
      .select(MEDICATION_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.category === "string" && filters.category.length > 0) {
      query = query.eq("category", filters.category);
    }

    if (searchTerm) {
      const escaped = escapeSearchTerm(searchTerm);
      const orFilter = SEARCH_COLUMNS
        .map((col) => `${col}.ilike.%${escaped}%`)
        .join(",");
      query = query.or(orFilter);
    }

    const sortColumn = params.sort?.column && SORTABLE_COLUMNS.has(params.sort.column)
      ? params.sort.column
      : "created_at";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load medications", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as Medication[], count: count ?? 0 };
  },
  async getSummary(_tenantId) {
    const { data, error } = await (supabase.rpc as any)("get_medication_summary");
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load medication summary", {
        code: error.code,
        details: error,
      });
    }

    return ((data as any)?.[0] ?? { total_count: 0, low_stock_count: 0, inventory_value: 0 }) as MedicationSummary;
  },
  async create(input, tenantId) {
    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      name: input.name,
    };

    if (input.category !== undefined) payload.category = input.category;
    if (input.stock !== undefined) payload.stock = input.stock;
    if (input.unit !== undefined) payload.unit = input.unit;
    if (input.price !== undefined) payload.price = input.price;
    if (input.status !== undefined) payload.status = input.status;

    const result = await supabase
      .from("medications")
      .insert(payload as any)
      .select(MEDICATION_COLUMNS)
      .single();

    return assertOk(result) as Medication;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};

    if (input.name !== undefined) payload.name = input.name;
    if (input.category !== undefined) payload.category = input.category;
    if (input.stock !== undefined) payload.stock = input.stock;
    if (input.unit !== undefined) payload.unit = input.unit;
    if (input.price !== undefined) payload.price = input.price;
    if (input.status !== undefined) payload.status = input.status;

    if (Object.keys(payload).length === 0) {
      const result = await supabase
        .from("medications")
        .select(MEDICATION_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as Medication;
    }

    const result = await supabase
      .from("medications")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(MEDICATION_COLUMNS)
      .single();

    return assertOk(result) as Medication;
  },
  async remove(id, tenantId) {
    const { error } = await supabase
      .from("medications")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to delete medication", {
        code: error.code,
        details: error,
      });
    }
  },
};
