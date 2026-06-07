import type {
  ProcurementListParams,
  ProcurementReceiptResult,
  PurchaseOrder,
  PurchaseOrderCreateInput,
  PurchaseOrderUpdateInput,
  StockReceiptCreateInput,
  Supplier,
  SupplierCreateInput,
  SupplierUpdateInput,
} from "@/domain/procurement/procurement.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { commandTraceParams } from "@/services/operational/commandTrace";
import { ServiceError } from "@/services/supabase/errors";

const SUPPLIER_COLUMNS =
  "id, tenant_id, name, contact_name, phone, email, address, status, created_at, updated_at";
const PURCHASE_ORDER_COLUMNS =
  "id, tenant_id, supplier_id, status, order_date, total_amount, notes, created_at, updated_at";

const SUPPLIER_SEARCH_COLUMNS = ["name", "contact_name", "phone", "email"];
const PURCHASE_ORDER_SORTABLE_COLUMNS = new Set(["created_at", "updated_at", "order_date", "status", "total_amount"]);
const SUPPLIER_SORTABLE_COLUMNS = new Set(["created_at", "updated_at", "name", "status"]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

function procurementCtx(
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

function commandRow<T>(data: unknown, emptyCode: string): T {
  const row = (data as any)?.[0];
  if (!row) {
    throw new ServiceError("Procurement command returned no result", { code: emptyCode });
  }
  return row;
}

export interface ProcurementRepository {
  listSuppliers(params: ProcurementListParams, tenantId: string): Promise<PagedResult<Supplier>>;
  createSupplier(input: SupplierCreateInput, tenantId: string, trace?: PlatformRepositoryContext["trace"]): Promise<Supplier>;
  updateSupplier(id: string, input: SupplierUpdateInput, tenantId: string, expectedUpdatedAt?: string, trace?: PlatformRepositoryContext["trace"]): Promise<Supplier | null>;
  archiveSupplier(id: string, tenantId: string, userId: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<Supplier>;
  restoreSupplier(id: string, tenantId: string, trace?: PlatformRepositoryContext["trace"]): Promise<Supplier>;
  listPurchaseOrders(params: ProcurementListParams, tenantId: string): Promise<PagedResult<PurchaseOrder>>;
  createPurchaseOrder(input: PurchaseOrderCreateInput, tenantId: string, trace?: PlatformRepositoryContext["trace"]): Promise<PurchaseOrder>;
  updatePurchaseOrder(id: string, input: PurchaseOrderUpdateInput, tenantId: string, expectedUpdatedAt?: string, trace?: PlatformRepositoryContext["trace"]): Promise<PurchaseOrder | null>;
  submitPurchaseOrder(id: string, tenantId: string, expectedUpdatedAt?: string, trace?: PlatformRepositoryContext["trace"]): Promise<PurchaseOrder | null>;
  cancelPurchaseOrder(id: string, tenantId: string, expectedUpdatedAt?: string, trace?: PlatformRepositoryContext["trace"]): Promise<PurchaseOrder | null>;
  receiveStock(input: StockReceiptCreateInput, tenantId: string, userId: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<ProcurementReceiptResult>;
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

export const procurementRepository: ProcurementRepository = {
  async listSuppliers(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("suppliers", procurementCtx(tenantId, "procurement.suppliers.list", "readonly"))
      .select(SUPPLIER_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (searchTerm) {
      const escaped = escapeSearchTerm(searchTerm);
      query = query.or(SUPPLIER_SEARCH_COLUMNS.map((col) => `${col}.ilike.%${escaped}%`).join(","));
    }

    const sortColumn = params.sort?.column && SUPPLIER_SORTABLE_COLUMNS.has(params.sort.column)
      ? params.sort.column
      : "created_at";
    query = query.order(sortColumn, { ascending: params.sort?.ascending ?? false }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load suppliers", { code: error.code, details: error });
    }
    return { data: (data ?? []) as Supplier[], count: count ?? 0 };
  },

  async createSupplier(input, tenantId, trace) {
    const { data, error } = await platformRepository.rpc("command_supplier", {
      p_operation: "create",
      p_supplier_id: null,
      p_tenant_id: tenantId,
      p_payload: input,
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["create", tenantId, input.name, input.email ?? ""].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.supplier.create", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to create supplier", { code: error.code, details: error });
    }
    const row = commandRow<any>(data, "SUPPLIER_COMMAND_EMPTY_RESULT");
    return row.supplier as Supplier;
  },

  async updateSupplier(id, input, tenantId, expectedUpdatedAt, trace) {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name;
    if (input.contact_name !== undefined) payload.contact_name = input.contact_name;
    if (input.phone !== undefined) payload.phone = input.phone;
    if (input.email !== undefined) payload.email = input.email;
    if (input.address !== undefined) payload.address = input.address;
    if (input.status !== undefined) payload.status = input.status;

    const { data, error } = await platformRepository.rpc("command_supplier", {
      p_operation: "update",
      p_supplier_id: id,
      p_tenant_id: tenantId,
      p_payload: payload,
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: ["update", id, tenantId, JSON.stringify(payload), expectedUpdatedAt ?? ""].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.supplier.update", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update supplier", { code: error.code, details: error });
    }
    const row = commandRow<any>(data, "SUPPLIER_COMMAND_EMPTY_RESULT");
    if (row.result_code === "CONFLICT") return null;
    return (row.supplier ?? null) as Supplier | null;
  },

  async archiveSupplier(id, tenantId, userId, trace) {
    const { data, error } = await platformRepository.rpc("command_supplier", {
      p_operation: "archive",
      p_supplier_id: id,
      p_tenant_id: tenantId,
      p_payload: {},
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["archive", id, tenantId].join("|"),
      p_user_id: userId ?? null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.supplier.archive", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to archive supplier", { code: error.code, details: error });
    }
    return commandRow<any>(data, "SUPPLIER_COMMAND_EMPTY_RESULT").supplier as Supplier;
  },

  async restoreSupplier(id, tenantId, trace) {
    const { data, error } = await platformRepository.rpc("command_supplier", {
      p_operation: "restore",
      p_supplier_id: id,
      p_tenant_id: tenantId,
      p_payload: {},
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["restore", id, tenantId].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.supplier.restore", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to restore supplier", { code: error.code, details: error });
    }
    return commandRow<any>(data, "SUPPLIER_COMMAND_EMPTY_RESULT").supplier as Supplier;
  },

  async listPurchaseOrders(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = platformRepository
      .from("purchase_orders", procurementCtx(tenantId, "procurement.purchaseOrders.list", "readonly"))
      .select(PURCHASE_ORDER_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.supplier_id === "string" && filters.supplier_id.length > 0) {
      query = query.eq("supplier_id", filters.supplier_id);
    }

    const sortColumn = params.sort?.column && PURCHASE_ORDER_SORTABLE_COLUMNS.has(params.sort.column)
      ? params.sort.column
      : "created_at";
    query = query.order(sortColumn, { ascending: params.sort?.ascending ?? false }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load purchase orders", { code: error.code, details: error });
    }
    return { data: (data ?? []) as PurchaseOrder[], count: count ?? 0 };
  },

  async createPurchaseOrder(input, tenantId, trace) {
    const { data, error } = await platformRepository.rpc("command_purchase_order", {
      p_operation: "create",
      p_purchase_order_id: null,
      p_tenant_id: tenantId,
      p_payload: input,
      p_expected_updated_at: null,
      p_idempotency_key: null,
      p_request_hash: ["create", tenantId, input.supplier_id, JSON.stringify(input.items)].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.purchaseOrder.create", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to create purchase order", { code: error.code, details: error });
    }
    return commandRow<any>(data, "PURCHASE_ORDER_COMMAND_EMPTY_RESULT").purchase_order as PurchaseOrder;
  },

  async updatePurchaseOrder(id, input, tenantId, expectedUpdatedAt, trace) {
    const payload: Record<string, unknown> = {};
    if (input.order_date !== undefined) payload.order_date = input.order_date;
    if (input.notes !== undefined) payload.notes = input.notes;

    const { data, error } = await platformRepository.rpc("command_purchase_order", {
      p_operation: "update",
      p_purchase_order_id: id,
      p_tenant_id: tenantId,
      p_payload: payload,
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: ["update", id, tenantId, JSON.stringify(payload), expectedUpdatedAt ?? ""].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.purchaseOrder.update", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update purchase order", { code: error.code, details: error });
    }
    const row = commandRow<any>(data, "PURCHASE_ORDER_COMMAND_EMPTY_RESULT");
    if (row.result_code === "CONFLICT") return null;
    return (row.purchase_order ?? null) as PurchaseOrder | null;
  },

  async submitPurchaseOrder(id, tenantId, expectedUpdatedAt, trace) {
    const { data, error } = await platformRepository.rpc("command_purchase_order", {
      p_operation: "submit",
      p_purchase_order_id: id,
      p_tenant_id: tenantId,
      p_payload: {},
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: ["submit", id, tenantId, expectedUpdatedAt ?? ""].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.purchaseOrder.submit", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to submit purchase order", { code: error.code, details: error });
    }
    const row = commandRow<any>(data, "PURCHASE_ORDER_COMMAND_EMPTY_RESULT");
    if (row.result_code === "CONFLICT") return null;
    return (row.purchase_order ?? null) as PurchaseOrder | null;
  },

  async cancelPurchaseOrder(id, tenantId, expectedUpdatedAt, trace) {
    const { data, error } = await platformRepository.rpc("command_purchase_order", {
      p_operation: "cancel",
      p_purchase_order_id: id,
      p_tenant_id: tenantId,
      p_payload: {},
      p_expected_updated_at: expectedUpdatedAt ?? null,
      p_idempotency_key: null,
      p_request_hash: ["cancel", id, tenantId, expectedUpdatedAt ?? ""].join("|"),
      p_user_id: null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.purchaseOrder.cancel", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to cancel purchase order", { code: error.code, details: error });
    }
    const row = commandRow<any>(data, "PURCHASE_ORDER_COMMAND_EMPTY_RESULT");
    if (row.result_code === "CONFLICT") return null;
    return (row.purchase_order ?? null) as PurchaseOrder | null;
  },

  async receiveStock(input, tenantId, userId, trace) {
    const { data, error } = await platformRepository.rpc("receive_procurement_stock", {
      p_purchase_order_id: input.purchase_order_id,
      p_purchase_order_item_id: input.purchase_order_item_id,
      p_tenant_id: tenantId,
      p_quantity: input.quantity,
      p_lot_number: input.lot_number,
      p_expiry_date: input.expiry_date ?? null,
      p_received_at: input.received_at ?? null,
      p_notes: input.notes ?? null,
      p_idempotency_key: null,
      p_request_hash: [input.purchase_order_id, input.purchase_order_item_id, input.quantity, input.lot_number].join("|"),
      p_user_id: userId ?? null,
      ...commandTraceParams(trace),
    }, procurementCtx(tenantId, "procurement.stock.receive", "critical", trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to receive procurement stock", { code: error.code, details: error });
    }
    const row = commandRow<any>(data, "PROCUREMENT_RECEIPT_COMMAND_EMPTY_RESULT");
    return {
      purchase_order: row.purchase_order as PurchaseOrder,
      stock_receipt: row.stock_receipt,
      medication_batch: row.medication_batch,
      inventory_movement: row.inventory_movement,
      medication: row.medication,
    };
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
      requiredCapabilities: [Capabilities.pharmacy.manage],
    };
  },
};
