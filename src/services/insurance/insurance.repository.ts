import type {
  InsuranceClaim,
  InsuranceClaimCreateInput,
  InsuranceClaimListParams,
  InsuranceClaimUpdateInput,
  InsuranceClaimWithPatient,
  InsuranceSummary,
} from "@/domain/insurance/insurance.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const CLAIM_COLUMNS =
  "id, tenant_id, patient_id, provider, service, amount, claim_date, status, created_at, updated_at";
const CLAIM_WITH_PATIENT_COLUMNS = `${CLAIM_COLUMNS}, patients(full_name)`;

const SEARCH_COLUMNS = ["provider", "service", "status"];
const SEARCH_COLUMNS_WITH_RELATIONS = [...SEARCH_COLUMNS, "patients.full_name"];
const SORTABLE_COLUMNS = new Set([
  "claim_date",
  "created_at",
  "updated_at",
  "status",
]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

export interface InsuranceRepository {
  listPaged(params: InsuranceClaimListParams, tenantId: string): Promise<PagedResult<InsuranceClaim>>;
  listPagedWithRelations(params: InsuranceClaimListParams, tenantId: string): Promise<PagedResult<InsuranceClaimWithPatient>>;
  getSummary(tenantId: string): Promise<InsuranceSummary>;
  create(input: InsuranceClaimCreateInput, tenantId: string): Promise<InsuranceClaim>;
  update(id: string, input: InsuranceClaimUpdateInput, tenantId: string): Promise<InsuranceClaim>;
}

export const insuranceRepository: InsuranceRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("insurance_claims")
      .select(CLAIM_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.patient_id === "string" && filters.patient_id.length > 0) {
      query = query.eq("patient_id", filters.patient_id);
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
      : "claim_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load insurance claims", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as InsuranceClaim[], count: count ?? 0 };
  },
  async listPagedWithRelations(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("insurance_claims")
      .select(CLAIM_WITH_PATIENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.patient_id === "string" && filters.patient_id.length > 0) {
      query = query.eq("patient_id", filters.patient_id);
    }

    if (searchTerm) {
      const escaped = escapeSearchTerm(searchTerm);
      const orFilter = SEARCH_COLUMNS_WITH_RELATIONS
        .map((col) => `${col}.ilike.%${escaped}%`)
        .join(",");
      query = query.or(orFilter);
    }

    const sortColumn = params.sort?.column && SORTABLE_COLUMNS.has(params.sort.column)
      ? params.sort.column
      : "claim_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load insurance claims", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as InsuranceClaimWithPatient[], count: count ?? 0 };
  },
  async getSummary(_tenantId) {
    const { data, error } = await (supabase.rpc as any)("get_insurance_summary");
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load insurance summary", {
        code: error.code,
        details: error,
      });
    }

    return ((data as any)?.[0] ?? {
      total_count: 0,
      pending_count: 0,
      approved_count: 0,
      rejected_count: 0,
      providers_count: 0,
    }) as InsuranceSummary;
  },
  async create(input, tenantId) {
    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      patient_id: input.patient_id,
      provider: input.provider,
      service: input.service,
      amount: input.amount,
    };

    if (input.claim_date !== undefined) payload.claim_date = input.claim_date;
    if (input.status !== undefined) payload.status = input.status;

    const result = await supabase
      .from("insurance_claims")
      .insert(payload as any)
      .select(CLAIM_COLUMNS)
      .single();

    return assertOk(result) as InsuranceClaim;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};

    if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
    if (input.provider !== undefined) payload.provider = input.provider;
    if (input.service !== undefined) payload.service = input.service;
    if (input.amount !== undefined) payload.amount = input.amount;
    if (input.claim_date !== undefined) payload.claim_date = input.claim_date;
    if (input.status !== undefined) payload.status = input.status;

    if (Object.keys(payload).length === 0) {
      const result = await supabase
        .from("insurance_claims")
        .select(CLAIM_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as InsuranceClaim;
    }

    const result = await supabase
      .from("insurance_claims")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(CLAIM_COLUMNS)
      .single();

    return assertOk(result) as InsuranceClaim;
  },
};
