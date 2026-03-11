import type {
  LabOrderWithDoctor,
  LabOrderWithPatientDoctor,
  LabResult,
  LabResultCreateInput,
  LabResultListParams,
  LabResultUpdateInput,
} from "@/domain/lab/lab.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const LAB_COLUMNS =
  "id, tenant_id, patient_id, doctor_id, test_name, order_date, status, result, created_at, updated_at";
const LAB_WITH_DOCTOR_COLUMNS = `${LAB_COLUMNS}, doctors(full_name)`;
const LAB_WITH_PATIENT_DOCTOR_COLUMNS = `${LAB_COLUMNS}, patients(full_name), doctors(full_name)`;

const SEARCH_COLUMNS = ["test_name", "status", "result"];
const SEARCH_COLUMNS_WITH_RELATIONS = [...SEARCH_COLUMNS, "patients.full_name", "doctors.full_name"];
const SORTABLE_COLUMNS = new Set([
  "order_date",
  "created_at",
  "updated_at",
  "status",
]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

export interface LabRepository {
  listPaged(params: LabResultListParams, tenantId: string): Promise<PagedResult<LabResult>>;
  listPagedWithRelations(params: LabResultListParams, tenantId: string): Promise<PagedResult<LabOrderWithPatientDoctor>>;
  countByStatus(tenantId: string): Promise<Record<"pending" | "processing" | "completed", number>>;
  listByPatient(patientId: string, tenantId: string): Promise<LabOrderWithDoctor[]>;
  create(input: LabResultCreateInput, tenantId: string): Promise<LabResult>;
  update(id: string, input: LabResultUpdateInput, tenantId: string): Promise<LabResult>;
}

export const labRepository: LabRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("lab_orders")
      .select(LAB_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.patient_id === "string" && filters.patient_id.length > 0) {
      query = query.eq("patient_id", filters.patient_id);
    }
    if (typeof filters.doctor_id === "string" && filters.doctor_id.length > 0) {
      query = query.eq("doctor_id", filters.doctor_id);
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
      : "order_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load lab orders", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as LabResult[], count: count ?? 0 };
  },
  async listPagedWithRelations(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("lab_orders")
      .select(LAB_WITH_PATIENT_DOCTOR_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.patient_id === "string" && filters.patient_id.length > 0) {
      query = query.eq("patient_id", filters.patient_id);
    }
    if (typeof filters.doctor_id === "string" && filters.doctor_id.length > 0) {
      query = query.eq("doctor_id", filters.doctor_id);
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
      : "order_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load lab orders", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as LabOrderWithPatientDoctor[], count: count ?? 0 };
  },
  async countByStatus(tenantId) {
    const statuses = ["pending", "processing", "completed"] as const;
    const results = await Promise.all(
      statuses.map(async (status) => {
        const { count, error } = await supabase
          .from("lab_orders")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", status);
        if (error) {
          throw new ServiceError(error.message ?? "Failed to load lab order counts", {
            code: error.code,
            details: error,
          });
        }
        return [status, count ?? 0] as const;
      }),
    );

    return results.reduce(
      (acc, [status, count]) => ({ ...acc, [status]: count }),
      { pending: 0, processing: 0, completed: 0 } as Record<"pending" | "processing" | "completed", number>,
    );
  },
  async listByPatient(patientId, tenantId) {
    const { data, error } = await supabase
      .from("lab_orders")
      .select(LAB_WITH_DOCTOR_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .order("order_date", { ascending: false });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient lab orders", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as LabOrderWithDoctor[];
  },
  async create(input, tenantId) {
    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      patient_id: input.patient_id,
      doctor_id: input.doctor_id,
      test_name: input.test_name,
    };

    if (input.order_date !== undefined) payload.order_date = input.order_date;
    if (input.status !== undefined) payload.status = input.status;
    if (input.result !== undefined) payload.result = input.result;

    const result = await supabase
      .from("lab_orders")
      .insert(payload)
      .select(LAB_COLUMNS)
      .single();

    return assertOk(result) as LabResult;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};

    if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
    if (input.doctor_id !== undefined) payload.doctor_id = input.doctor_id;
    if (input.test_name !== undefined) payload.test_name = input.test_name;
    if (input.order_date !== undefined) payload.order_date = input.order_date;
    if (input.status !== undefined) payload.status = input.status;
    if (input.result !== undefined) payload.result = input.result;

    if (Object.keys(payload).length === 0) {
      const result = await supabase
        .from("lab_orders")
        .select(LAB_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as LabResult;
    }

    const result = await supabase
      .from("lab_orders")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(LAB_COLUMNS)
      .single();

    return assertOk(result) as LabResult;
  },
};
