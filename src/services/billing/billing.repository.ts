import type {
  Invoice,
  InvoiceCreateInput,
  InvoiceListParams,
  InvoicePayment,
  InvoicePaymentCreateInput,
  InvoicePaymentCommandResult,
  InvoiceSummary,
  InvoiceUpdateInput,
  InvoiceWithPatient,
} from "@/domain/billing/billing.types";
import type { LimitOffsetParams, PagedResult } from "@/domain/shared/pagination.types";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";
import { assertBillingMoneyNonNegative, assertInvoiceTenantScope } from "@/platform/billing/invariants";

function billingCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "financial",
  extra?: Pick<PlatformRepositoryContext, "signal" | "trace" | "subsystem">,
): PlatformRepositoryContext {
  const isWrite = classification !== "readonly" && classification !== "eventual";
  return {
    action,
    classification,
    tenantScoped: true,
    tenantId,
    subsystem: isWrite ? "billing" : undefined,
    ...extra,
  };
}

const INVOICE_COLUMNS =
  "id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due, invoice_date, due_date, paid_at, voided_at, void_reason, status, deleted_at, deleted_by, created_at, updated_at";
/** Must match FK name on `invoices(patient_id)` → `patients(id)` (disambiguates from composite `invoices_patient_tenant_fk`). */
const INVOICES_PATIENT_FK = "invoices_patient_id_fkey";
const INVOICE_WITH_PATIENT_COLUMNS = `${INVOICE_COLUMNS}, patients!${INVOICES_PATIENT_FK}(full_name)`;
const PAYMENT_COLUMNS =
  "id, tenant_id, invoice_id, patient_id, amount, payment_method, paid_at, reference, notes, created_at, created_by";

const SEARCH_COLUMNS = ["invoice_code", "service", "status"];
const SEARCH_COLUMNS_WITH_RELATIONS = [...SEARCH_COLUMNS, `patients!${INVOICES_PATIENT_FK}.full_name`];
const SORTABLE_COLUMNS = new Set([
  "invoice_date",
  "due_date",
  "created_at",
  "updated_at",
  "status",
  "balance_due",
]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

export interface BillingRepository {
  listPaged(params: InvoiceListParams, tenantId: string): Promise<PagedResult<Invoice>>;
  listPagedWithRelations(params: InvoiceListParams, tenantId: string): Promise<PagedResult<InvoiceWithPatient>>;
  getById(id: string, tenantId: string): Promise<Invoice>;
  getSummary(tenantId: string): Promise<InvoiceSummary>;
  countInRange(start: string, end: string, tenantId: string): Promise<number>;
  listByDateRange(start: string, end: string, tenantId: string, params?: LimitOffsetParams): Promise<Invoice[]>;
  listByPatient(patientId: string, tenantId: string, params?: LimitOffsetParams): Promise<Invoice[]>;
  listPayments(invoiceId: string, tenantId: string): Promise<InvoicePayment[]>;
  create(input: InvoiceCreateInput, tenantId: string): Promise<Invoice>;
  update(id: string, input: InvoiceUpdateInput, tenantId: string, expectedUpdatedAt?: string): Promise<Invoice | null>;
  postPaymentAtomic(
    invoiceId: string,
    input: InvoicePaymentCreateInput,
    tenantId: string,
    userId?: string | null,
    trace?: PlatformRepositoryContext["trace"],
  ): Promise<InvoicePaymentCommandResult>;
  createPayment(invoiceId: string, patientId: string, input: InvoicePaymentCreateInput, tenantId: string, userId?: string | null): Promise<InvoicePayment>;
  archive(id: string, tenantId: string, userId: string): Promise<Invoice>;
  restore(id: string, tenantId: string): Promise<Invoice>;
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
  };
}

export const billingRepository: BillingRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.listPaged", "readonly"))
      .select(INVOICE_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

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

    let query = platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.listPagedWithRelations", "readonly"))
      .select(INVOICE_WITH_PATIENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

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
  async getById(id, tenantId) {
    const result = await platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.getById", "readonly"))
      .select(INVOICE_COLUMNS)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .single();

    const invoice = assertOk(result) as Invoice;
    assertInvoiceTenantScope(invoice.tenant_id, tenantId);
    return invoice;
  },
  async getSummary(tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_invoice_summary",
      { _tenant_id: tenantId },
      billingCtx(tenantId, "billing.invoice.getSummary", "readonly"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load invoice summary", {
        code: error.code,
        details: error,
      });
    }

    return ((data as any)?.[0] ?? { total_count: 0, paid_count: 0, paid_amount: 0, pending_amount: 0 }) as InvoiceSummary;
  },
  async countInRange(start, end, tenantId) {
    const { count, error } = await platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.countInRange", "readonly"))
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
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
  async listByDateRange(start, end, tenantId, params) {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const { data, error } = await platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.listByDateRange", "readonly"))
      .select(INVOICE_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .gte("invoice_date", start)
      .lte("invoice_date", end)
      .order("invoice_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load invoices", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as Invoice[];
  },
  async listByPatient(patientId, tenantId, params) {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const { data, error } = await platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.listByPatient", "readonly"))
      .select(INVOICE_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("patient_id", patientId)
      .order("invoice_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient invoices", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as Invoice[];
  },
  async listPayments(invoiceId, tenantId) {
    const { data, error } = await platformRepository
      .from("invoice_payments", billingCtx(tenantId, "billing.payment.list", "readonly"))
      .select(PAYMENT_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("invoice_id", invoiceId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load invoice payments", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as InvoicePayment[];
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
    if (input.due_date !== undefined) payload.due_date = input.due_date;
    if (input.status !== undefined) payload.status = input.status;
    if (input.amount_paid !== undefined) payload.amount_paid = input.amount_paid;
    if (input.balance_due !== undefined) payload.balance_due = input.balance_due;
    if (input.paid_at !== undefined) payload.paid_at = input.paid_at;
    if (input.voided_at !== undefined) payload.voided_at = input.voided_at;
    if (input.void_reason !== undefined) payload.void_reason = input.void_reason;

    const result = await platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.create"))
      .insert(payload as never)
      .select(INVOICE_COLUMNS)
      .single();

    return assertOk(result) as Invoice;
  },
  async update(id, input, tenantId, expectedUpdatedAt) {
    const payload: Record<string, unknown> = {};

    if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
    if (input.invoice_code !== undefined) payload.invoice_code = input.invoice_code;
    if (input.service !== undefined) payload.service = input.service;
    if (input.amount !== undefined) payload.amount = input.amount;
    if (input.amount_paid !== undefined) payload.amount_paid = input.amount_paid;
    if (input.balance_due !== undefined) payload.balance_due = input.balance_due;
    if (input.invoice_date !== undefined) payload.invoice_date = input.invoice_date;
    if (input.due_date !== undefined) payload.due_date = input.due_date;
    if (input.paid_at !== undefined) payload.paid_at = input.paid_at;
    if (input.voided_at !== undefined) payload.voided_at = input.voided_at;
    if (input.void_reason !== undefined) payload.void_reason = input.void_reason;
    if (input.status !== undefined) payload.status = input.status;

    if (Object.keys(payload).length === 0) {
      const result = await platformRepository
        .from("invoices", billingCtx(tenantId, "billing.invoice.getForUpdate", "readonly"))
        .select(INVOICE_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as Invoice;
    }

    let query = platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.update"))
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (expectedUpdatedAt) {
      query = query.eq("updated_at", expectedUpdatedAt);
    }
    const { data, error } = await query.select(INVOICE_COLUMNS).maybeSingle();
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update invoice", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? null) as Invoice | null;
  },
  async postPaymentAtomic(invoiceId, input, tenantId, userId, trace?: PlatformRepositoryContext["trace"]) {
    assertBillingMoneyNonNegative(Number(input.amount), "payment.amount");
    const requestHash = [
      invoiceId,
      tenantId,
      input.amount,
      input.payment_method,
      input.paid_at ?? "",
      input.reference ?? "",
      input.notes ?? "",
    ].join("|");

    const { data, error } = await platformRepository.rpc("post_invoice_payment", {
      p_invoice_id: invoiceId,
      p_tenant_id: tenantId,
      p_amount: input.amount,
      p_payment_method: input.payment_method,
      p_paid_at: input.paid_at ?? null,
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotency_key ?? null,
    p_request_hash: requestHash,
    p_user_id: userId ?? null,
    p_request_trace_id: trace?.requestTraceId ?? null,
    p_operation_trace_id: trace?.operationTraceId ?? null,
    p_workflow_trace_id: trace?.workflowTraceId ?? null,
  }, billingCtx(tenantId, "billing.payment.postAtomic", "financial", trace ? { trace } : undefined));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to post invoice payment", {
        code: error.code,
        details: error,
      });
    }

    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Payment command returned no result", { code: "PAYMENT_COMMAND_EMPTY_RESULT" });
    }

    return {
      result_code: row.result_code,
      retryable: Boolean(row.retryable),
      idempotency_replay: Boolean(row.idempotency_replay),
      message: row.message ?? null,
      invoice: row.invoice ?? null,
      payment: row.payment ?? null,
    } as InvoicePaymentCommandResult;
  },
  async createPayment(invoiceId, patientId, input, tenantId, userId) {
    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      invoice_id: invoiceId,
      patient_id: patientId,
      amount: input.amount,
      payment_method: input.payment_method,
      created_by: userId ?? null,
    };

    if (input.paid_at !== undefined) payload.paid_at = input.paid_at;
    if (input.reference !== undefined) payload.reference = input.reference;
    if (input.notes !== undefined) payload.notes = input.notes;

    const result = await platformRepository
      .from("invoice_payments", billingCtx(tenantId, "billing.payment.create"))
      .insert(payload as never)
      .select(PAYMENT_COLUMNS)
      .single();

    return assertOk(result) as InvoicePayment;
  },
  async archive(id, tenantId, userId) {
    const result = await platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.archive"))
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(INVOICE_COLUMNS)
      .single();

    return assertOk(result) as Invoice;
  },
  async restore(id, tenantId) {
    const result = await platformRepository
      .from("invoices", billingCtx(tenantId, "billing.invoice.restore"))
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(INVOICE_COLUMNS)
      .single();

    return assertOk(result) as Invoice;
  },
  describe() {
    return {
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: false,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [],
      exceptions: [
        "Billing repository still has legacy non-atomic invoice create/update/status paths; postPaymentAtomic is the current DB-authoritative template.",
      ],
    };
  },
};
