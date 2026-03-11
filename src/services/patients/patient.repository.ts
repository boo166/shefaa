import type { Patient, PatientCreateInput, PatientUpdateInput, PatientListParams } from "@/domain/patient/patient.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const PATIENT_COLUMNS =
  "id, tenant_id, patient_code, full_name, date_of_birth, gender, blood_type, phone, email, address, insurance_provider, status, created_at, updated_at";

const SEARCH_COLUMNS = ["patient_code", "full_name", "phone", "email"];
const SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "full_name",
  "patient_code",
  "date_of_birth",
  "status",
]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

export interface PatientRepository {
  listPaged(params: PatientListParams, tenantId: string): Promise<PagedResult<Patient>>;
  getById(id: string, tenantId: string): Promise<Patient>;
  create(input: PatientCreateInput, tenantId: string): Promise<Patient>;
  update(id: string, input: PatientUpdateInput, tenantId: string): Promise<Patient>;
  deleteBulk(ids: string[], tenantId: string): Promise<void>;
}

export const patientRepository: PatientRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("patients")
      .select(PATIENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
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
      throw new ServiceError(error.message ?? "Failed to load patients", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as Patient[], count: count ?? 0 };
  },
  async getById(id, tenantId) {
    const result = await supabase
      .from("patients")
      .select(PATIENT_COLUMNS)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    return assertOk(result) as Patient;
  },
  async create(input, tenantId) {
    const payload = {
      tenant_id: tenantId,
      patient_code: "",
      full_name: input.full_name,
      date_of_birth: input.date_of_birth ?? null,
      gender: input.gender ?? null,
      blood_type: input.blood_type ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      insurance_provider: input.insurance_provider ?? null,
      status: input.status ?? "active",
    };

    const result = await supabase
      .from("patients")
      .insert(payload)
      .select(PATIENT_COLUMNS)
      .single();

    return assertOk(result) as Patient;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};

    if (input.full_name !== undefined) payload.full_name = input.full_name;
    if (input.date_of_birth !== undefined) payload.date_of_birth = input.date_of_birth;
    if (input.gender !== undefined) payload.gender = input.gender;
    if (input.blood_type !== undefined) payload.blood_type = input.blood_type;
    if (input.phone !== undefined) payload.phone = input.phone;
    if (input.email !== undefined) payload.email = input.email;
    if (input.address !== undefined) payload.address = input.address;
    if (input.insurance_provider !== undefined) payload.insurance_provider = input.insurance_provider;
    if (input.status !== undefined) payload.status = input.status;

    if (Object.keys(payload).length === 0) {
      return patientRepository.getById(id, tenantId);
    }

    const result = await supabase
      .from("patients")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(PATIENT_COLUMNS)
      .single();

    return assertOk(result) as Patient;
  },
  async deleteBulk(ids, tenantId) {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("patients")
      .delete()
      .in("id", ids)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to delete patients", {
        code: error.code,
        details: error,
      });
    }
  },
};
