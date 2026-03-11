import type {
  Invoice,
  InvoiceCreateInput,
  InvoiceListParams,
  InvoiceSummary,
  InvoiceUpdateInput,
  InvoiceWithPatient,
} from "@/domain/billing/billing.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const INVOICE_COLUMNS =
  "id, tenant_id, patient_id, invoice_code, service, amount, invoice_date, status, created_at, updated_at";
const INVOICE_WITH_PATIENT_COLUMNS = `${INVOICE_COLUMNS}, patients(full_name)`;

const SEARCH_COLUMNS = ["invoice_code", "service", "status"];
const SEARCH_COLUMNS_WITH_RELATIONS = [...SEARCH_COLUMNS, "patients.full_name"];
const SORTABLE_COLUMNS = new Set([
  "invoice_date",
  "created_at",
  "updated_at",
  "status",
]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

export interface BillingRepository {
  listPaged(params: InvoiceListParams, tenantId: string): Promise<PagedResult<Invoice>>;
  listPagedWithRelations(params: InvoiceListParams, tenantId: string): Promise<PagedResult<InvoiceWithPatient>>;
  getSummary(tenantId: string): Promise<InvoiceSummary>;
  countInRange(start: string, end: string, tenantId: string): Promise<number>;
  listByPatient(patientId: string, tenantId: string): Promise<Invoice[]>;
  create(input: InvoiceCreateInput, tenantId: string): Promise<Invoice>;
  update(id: string, input: InvoiceUpdateInput, tenantId: string): Promise<Invoice>;
}

export const billingRepository: BillingRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("invoices")
      .select(INVOICE_COLUMNS, { count: "exact" })
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
      : "invoice_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load invoices", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as Invoice[], count: count ?? 0 };
  },
  async listPagedWithRelations(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("invoices")
      .select(INVOICE_WITH_PATIENT_COLUMNS, { count: "exact" })
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
      : "invoice_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load invoices", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as InvoiceWithPatient[], count: count ?? 0 };
  },
  async getSummary(_tenantId) {
    const { data, error } = await (supabase.rpc as any)("get_invoice_summary");
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load invoice summary", {
        code: error.code,
        details: error,
      });
    }

    return ((data as any)?.[0] ?? { total_count: 0, paid_count: 0, paid_amount: 0, pending_amount: 0 }) as InvoiceSummary;
  },
  async countInRange(start, end, tenantId) {
    const { count, error } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("invoice_date", start)
      .lt("invoice_date", end);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load invoices", {
        code: error.code,
        details: error,
      });
    }

    return count ?? 0;
  },
  async listByPatient(patientId, tenantId) {
    const { data, error } = await supabase
      .from("invoices")
      .select(INVOICE_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .order("invoice_date", { ascending: false });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient invoices", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as Invoice[];
  },
  async create(input, tenantId) {
    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      patient_id: input.patient_id,
      invoice_code: input.invoice_code,
      service: input.service,
      amount: input.amount,
    };

    if (input.invoice_date !== undefined) payload.invoice_date = input.invoice_date;
    if (input.status !== undefined) payload.status = input.status;

    const result = await supabase
      .from("invoices")
      .insert(payload)
      .select(INVOICE_COLUMNS)
      .single();

    return assertOk(result) as Invoice;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};

    if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
    if (input.invoice_code !== undefined) payload.invoice_code = input.invoice_code;
    if (input.service !== undefined) payload.service = input.service;
    if (input.amount !== undefined) payload.amount = input.amount;
    if (input.invoice_date !== undefined) payload.invoice_date = input.invoice_date;
    if (input.status !== undefined) payload.status = input.status;

    if (Object.keys(payload).length === 0) {
      const result = await supabase
        .from("invoices")
        .select(INVOICE_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as Invoice;
    }

    const result = await supabase
      .from("invoices")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(INVOICE_COLUMNS)
      .single();

    return assertOk(result) as Invoice;
  },
};
