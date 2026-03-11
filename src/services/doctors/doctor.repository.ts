import type { Doctor, DoctorCreateInput, DoctorUpdateInput, DoctorListParams } from "@/domain/doctor/doctor.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const DOCTOR_COLUMNS =
  "id, tenant_id, user_id, full_name, specialty, phone, email, rating, status, created_at, updated_at";

const SEARCH_COLUMNS = ["full_name", "specialty", "phone", "email"];
const SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "full_name",
  "specialty",
  "rating",
  "status",
]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

export interface DoctorRepository {
  listPaged(params: DoctorListParams, tenantId: string): Promise<PagedResult<Doctor>>;
  create(input: DoctorCreateInput, tenantId: string): Promise<Doctor>;
  update(id: string, input: DoctorUpdateInput, tenantId: string): Promise<Doctor>;
  remove(id: string, tenantId: string): Promise<void>;
}

export const doctorRepository: DoctorRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("doctors")
      .select(DOCTOR_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.specialty === "string" && filters.specialty.length > 0) {
      query = query.eq("specialty", filters.specialty);
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
      throw new ServiceError(error.message ?? "Failed to load doctors", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as Doctor[], count: count ?? 0 };
  },
  async create(input, tenantId) {
    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      full_name: input.full_name,
      specialty: input.specialty,
    };

    if (input.phone !== undefined) payload.phone = input.phone;
    if (input.email !== undefined) payload.email = input.email;
    if (input.rating !== undefined) payload.rating = input.rating;
    if (input.status !== undefined) payload.status = input.status;

    const result = await supabase
      .from("doctors")
      .insert(payload)
      .select(DOCTOR_COLUMNS)
      .single();

    return assertOk(result) as Doctor;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};

    if (input.full_name !== undefined) payload.full_name = input.full_name;
    if (input.specialty !== undefined) payload.specialty = input.specialty;
    if (input.phone !== undefined) payload.phone = input.phone;
    if (input.email !== undefined) payload.email = input.email;
    if (input.rating !== undefined) payload.rating = input.rating;
    if (input.status !== undefined) payload.status = input.status;

    if (Object.keys(payload).length === 0) {
      const result = await supabase
        .from("doctors")
        .select(DOCTOR_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as Doctor;
    }

    const result = await supabase
      .from("doctors")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(DOCTOR_COLUMNS)
      .single();

    return assertOk(result) as Doctor;
  },
  async remove(id, tenantId) {
    const { error } = await supabase
      .from("doctors")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to delete doctor", {
        code: error.code,
        details: error,
      });
    }
  },
};
