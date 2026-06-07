import type {
  LabOrderWithDoctor,
  LabOrderWithPatientDoctor,
  LabResult,
  LabResultCreateInput,
  LabResultListParams,
  LabResultUpdateInput,
} from "@/domain/lab/lab.types";
import type { LimitOffsetParams, PagedResult } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { commandTraceParams } from "@/services/operational/commandTrace";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const LAB_COLUMNS =
  "id, tenant_id, patient_id, doctor_id, test_name, order_date, status, result, result_value, result_unit, reference_range, abnormal_flag, result_notes, resulted_at, deleted_at, deleted_by, created_at, updated_at";
const LAB_WITH_DOCTOR_COLUMNS = `${LAB_COLUMNS}, doctors(full_name)`;
const LAB_WITH_PATIENT_DOCTOR_COLUMNS = `${LAB_COLUMNS}, patients(full_name), doctors(full_name)`;

const SEARCH_COLUMNS = ["test_name", "status", "result", "result_value", "reference_range", "result_notes"];
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
  listByPatient(patientId: string, tenantId: string, params?: LimitOffsetParams): Promise<LabOrderWithDoctor[]>;
  getById(id: string, tenantId: string): Promise<LabResult>;
  create(input: LabResultCreateInput, tenantId: string, trace?: PlatformRepositoryContext["trace"]): Promise<LabResult>;
  update(id: string, input: LabResultUpdateInput, tenantId: string, expectedUpdatedAt?: string, trace?: PlatformRepositoryContext["trace"]): Promise<LabResult | null>;
  finalizeResult(
    id: string,
    input: LabResultUpdateInput,
    tenantId: string,
    userId: string | null,
    expectedUpdatedAt?: string,
    trace?: PlatformRepositoryContext["trace"],
  ): Promise<LabResult | null>;
  archive(id: string, tenantId: string, userId: string, trace?: PlatformRepositoryContext["trace"]): Promise<LabResult>;
  restore(id: string, tenantId: string, trace?: PlatformRepositoryContext["trace"]): Promise<LabResult>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    traceAware: boolean;
    runtimeAware: boolean;
    capabilityAware: boolean;
    reconciliationAware: boolean;
    recoveryAware: boolean;
    evidenceAware: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
    exceptions?: string[];
  };
}

function labCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
  trace?: PlatformRepositoryContext["trace"],
): PlatformRepositoryContext {
  return {
    action,
    classification,
    tenantScoped: true,
    tenantId,
    requiredCapabilities: [Capabilities.records.manage, Capabilities.laboratory.manage],
    trace,
  };
}

export const labRepository: LabRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("lab_orders", labCtx(tenantId, "lab.listPaged", "readonly"))
      .select(LAB_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

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

    let query = platformRepository
      .from("lab_orders", labCtx(tenantId, "lab.listPagedWithRelations", "readonly"))
      .select(LAB_WITH_PATIENT_DOCTOR_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

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
        const { count, error } = await platformRepository
          .from("lab_orders", labCtx(tenantId, "lab.countByStatus", "readonly"))
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
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
  async listByPatient(patientId, tenantId, params) {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const { data, error } = await platformRepository
      .from("lab_orders", labCtx(tenantId, "lab.listByPatient", "readonly"))
      .select(LAB_WITH_DOCTOR_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("patient_id", patientId)
      .order("order_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient lab orders", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as LabOrderWithDoctor[];
  },
  async getById(id, tenantId) {
    const result = await platformRepository
      .from("lab_orders", labCtx(tenantId, "lab.getById", "readonly"))
      .select(LAB_COLUMNS)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .single();

    return assertOk(result) as LabResult;
  },
  async create(input, tenantId, trace) {
    const { data, error } = await platformRepository.rpc("command_lab_order", {
      p_operation: "create",
      p_lab_order_id: null,
      p_tenant_id: tenantId,
      p_payload: input,
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["create", tenantId, input.patient_id, input.doctor_id, input.test_name].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, labCtx(tenantId, "lab.create", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to create lab order", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row?.lab_order) {
      throw new ServiceError("Lab order command returned no result", { code: "LAB_ORDER_COMMAND_EMPTY_RESULT" });
    }
    return row.lab_order as LabResult;
  },
  async update(id, input, tenantId, expectedUpdatedAt, trace) {
    const payload: Record<string, unknown> = {};

    if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
    if (input.doctor_id !== undefined) payload.doctor_id = input.doctor_id;
    if (input.test_name !== undefined) payload.test_name = input.test_name;
    if (input.order_date !== undefined) payload.order_date = input.order_date;
    if (input.status !== undefined) payload.status = input.status;
    if (input.result !== undefined) payload.result = input.result;
    if (input.result_value !== undefined) payload.result_value = input.result_value;
    if (input.result_unit !== undefined) payload.result_unit = input.result_unit;
    if (input.reference_range !== undefined) payload.reference_range = input.reference_range;
    if (input.abnormal_flag !== undefined) payload.abnormal_flag = input.abnormal_flag;
    if (input.result_notes !== undefined) payload.result_notes = input.result_notes;
    if (input.resulted_at !== undefined) payload.resulted_at = input.resulted_at;

    if (Object.keys(payload).length === 0) {
      const result = await platformRepository
        .from("lab_orders", labCtx(tenantId, "lab.getForUpdate", "readonly"))
        .select(LAB_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as LabResult;
    }

    const { data, error } = await platformRepository.rpc("command_lab_order", {
      p_operation: "update",
      p_lab_order_id: id,
      p_tenant_id: tenantId,
      p_payload: payload,
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: ["update", id, tenantId, JSON.stringify(payload), expectedUpdatedAt ?? ""].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, labCtx(tenantId, "lab.update", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update lab order", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Lab order command returned no result", { code: "LAB_ORDER_COMMAND_EMPTY_RESULT" });
    }
    if (row.result_code === "CONFLICT") return null;
    return (row.lab_order ?? null) as LabResult | null;
  },
  async finalizeResult(id, input, tenantId, userId, expectedUpdatedAt, trace) {
    const requestHash = [
      id,
      tenantId,
      input.status ?? "completed",
      input.result ?? "",
      input.result_value ?? "",
      input.result_unit ?? "",
      input.reference_range ?? "",
      input.abnormal_flag ?? "",
      input.result_notes ?? "",
      expectedUpdatedAt ?? "",
    ].join("|");
    const { data, error } = await platformRepository.rpc("finalize_lab_result", {
      p_lab_order_id: id,
      p_tenant_id: tenantId,
      p_status: input.status ?? "completed",
      p_result: input.result ?? null,
      p_result_value: input.result_value ?? null,
      p_result_unit: input.result_unit ?? null,
      p_reference_range: input.reference_range ?? null,
      p_abnormal_flag: input.abnormal_flag ?? null,
      p_result_notes: input.result_notes ?? null,
      p_resulted_at: input.resulted_at ?? null,
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: requestHash,
      p_user_id: userId ?? null,
      ...commandTraceParams(trace),
    }, labCtx(tenantId, "lab.result.finalize", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to finalize lab result", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Lab result command returned no result", { code: "LAB_RESULT_COMMAND_EMPTY_RESULT" });
    }
    if (row.result_code === "CONFLICT") return null;
    return (row.lab_order ?? null) as LabResult | null;
  },
  async archive(id, tenantId, userId, trace) {
    const { data, error } = await platformRepository.rpc("command_lab_order", {
      p_operation: "archive",
      p_lab_order_id: id,
      p_tenant_id: tenantId,
      p_payload: {},
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["archive", id, tenantId].join("|"),
      p_user_id: userId,
      ...commandTraceParams(trace),
    }, labCtx(tenantId, "lab.archive", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to archive lab order", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row?.lab_order) {
      throw new ServiceError("Lab order command returned no result", { code: "LAB_ORDER_COMMAND_EMPTY_RESULT" });
    }
    return row.lab_order as LabResult;
  },
  async restore(id, tenantId, trace) {
    const { data, error } = await platformRepository.rpc("command_lab_order", {
      p_operation: "restore",
      p_lab_order_id: id,
      p_tenant_id: tenantId,
      p_payload: {},
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["restore", id, tenantId].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, labCtx(tenantId, "lab.restore", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to restore lab order", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row?.lab_order) {
      throw new ServiceError("Lab order command returned no result", { code: "LAB_ORDER_COMMAND_EMPTY_RESULT" });
    }
    return row.lab_order as LabResult;
  },
  describe() {
    return {
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [Capabilities.records.manage, Capabilities.laboratory.manage],
    };
  },
};
