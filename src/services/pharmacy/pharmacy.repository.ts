import type { Medication, MedicationCreateInput, MedicationListParams, MedicationSummary, MedicationUpdateInput } from "@/domain/pharmacy/medication.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
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
  update(id: string, input: MedicationUpdateInput, tenantId: string, expectedUpdatedAt?: string): Promise<Medication | null>;
  adjustStock(
    id: string,
    stock: number,
    tenantId: string,
    userId: string | null,
    expectedUpdatedAt?: string,
    trace?: PlatformRepositoryContext["trace"],
  ): Promise<Medication | null>;
  remove(id: string, tenantId: string): Promise<void>;
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

function pharmacyCtx(
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
    requiredCapabilities: [Capabilities.pharmacy.manage],
    trace,
  };
}

export const pharmacyRepository: PharmacyRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("medications", pharmacyCtx(tenantId, "pharmacy.listPaged", "readonly"))
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
  async getSummary(tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_medication_summary",
      {},
      pharmacyCtx(tenantId, "pharmacy.getSummary", "readonly"),
    );
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

    const result = await platformRepository
      .from("medications", pharmacyCtx(tenantId, "pharmacy.create"))
      .insert(payload as any)
      .select(MEDICATION_COLUMNS)
      .single();

    return assertOk(result) as Medication;
  },
  async update(id, input, tenantId, expectedUpdatedAt) {
    const payload: Record<string, unknown> = {};

    if (input.name !== undefined) payload.name = input.name;
    if (input.category !== undefined) payload.category = input.category;
    if (input.stock !== undefined) payload.stock = input.stock;
    if (input.unit !== undefined) payload.unit = input.unit;
    if (input.price !== undefined) payload.price = input.price;
    if (input.status !== undefined) payload.status = input.status;

    if (Object.keys(payload).length === 0) {
      const result = await platformRepository
        .from("medications", pharmacyCtx(tenantId, "pharmacy.getForUpdate", "readonly"))
        .select(MEDICATION_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as Medication;
    }

    let query = platformRepository
      .from("medications", pharmacyCtx(tenantId, "pharmacy.update"))
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (expectedUpdatedAt) {
      query = query.eq("updated_at", expectedUpdatedAt);
    }
    const { data, error } = await query.select(MEDICATION_COLUMNS).maybeSingle();
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update medication", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? null) as Medication | null;
  },
  async adjustStock(id, stock, tenantId, userId, expectedUpdatedAt, trace) {
    const requestHash = [id, tenantId, stock, expectedUpdatedAt ?? ""].join("|");
    const { data, error } = await platformRepository.rpc("adjust_medication_stock", {
      p_medication_id: id,
      p_tenant_id: tenantId,
      p_stock: stock,
      p_reason: "pharmacy.stock_update",
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: requestHash,
      p_user_id: userId ?? null,
      p_request_trace_id: null,
      p_operation_trace_id: null,
      p_workflow_trace_id: null,
    }, pharmacyCtx(tenantId, "pharmacy.stock.adjust", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to adjust medication stock", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Medication stock command returned no result", { code: "MEDICATION_STOCK_COMMAND_EMPTY_RESULT" });
    }
    if (row.result_code === "CONFLICT") return null;
    return (row.medication ?? null) as Medication | null;
  },
  async remove(id, tenantId) {
    const { error } = await platformRepository
      .from("medications", pharmacyCtx(tenantId, "pharmacy.remove"))
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
  describe() {
    return {
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: false,
      recoveryAware: false,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [Capabilities.pharmacy.manage],
      exceptions: [
        "Stock adjustment is DB-authoritative, but create/update metadata/remove paths are not yet fully recovery-aware.",
      ],
    };
  },
};
