import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema } from "../shared/date.schema";
import { listParamsSchema } from "../shared/pagination.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const invoiceStatusEnum = z.enum(["paid", "pending", "overdue", "partially_paid", "void", "partially_refunded", "refunded", "written_off"]);
export const paymentMethodEnum = z.enum(["cash", "card", "bank_transfer", "mobile_wallet", "insurance", "other"]);

export const invoiceSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  patient_id: uuidSchema,
  invoice_code: z.string().trim().min(3).max(20),
  service: z.string().trim().min(1).max(200),
  amount: z.coerce.number().min(0),
  amount_paid: z.coerce.number().min(0),
  balance_due: z.coerce.number().min(0),
  invoice_date: dateStringSchema,
  due_date: dateStringSchema.optional().nullable(),
  paid_at: dateTimeStringSchema.optional().nullable(),
  voided_at: dateTimeStringSchema.optional().nullable(),
  void_reason: z.string().trim().max(500).optional().nullable(),
  status: invoiceStatusEnum,
  deleted_at: dateTimeStringSchema.optional().nullable(),
  deleted_by: uuidSchema.optional().nullable(),
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

function normalizeEmbeddedPatient(raw: unknown): unknown {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export const invoiceWithPatientSchema = invoiceSchema.extend({
  patients: z.preprocess(
    normalizeEmbeddedPatient,
    z
      .object({
        full_name: z.union([z.string(), z.null()]).optional(),
      })
      .optional()
      .nullable(),
  ),
});

export const invoiceCreateSchema = invoiceSchema
  .omit({
    id: true,
    tenant_id: true,
    amount_paid: true,
    balance_due: true,
    paid_at: true,
    voided_at: true,
    deleted_at: true,
    deleted_by: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    status: invoiceStatusEnum.optional(),
    invoice_date: dateStringSchema.optional(),
    due_date: dateStringSchema.optional().nullable(),
    void_reason: z.string().trim().max(500).optional().nullable(),
  });

export const invoiceUpdateSchema = invoiceCreateSchema
  .partial()
  .extend({
    amount_paid: z.coerce.number().min(0).optional(),
    balance_due: z.coerce.number().min(0).optional(),
    paid_at: dateTimeStringSchema.optional().nullable(),
    voided_at: dateTimeStringSchema.optional().nullable(),
    expected_updated_at: dateTimeStringSchema.optional(),
  });

export const invoicePaymentSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  invoice_id: uuidSchema,
  patient_id: uuidSchema,
  amount: z.coerce.number().positive(),
  payment_method: paymentMethodEnum,
  paid_at: dateTimeStringSchema,
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  created_at: dateTimeStringSchema,
  created_by: uuidSchema.optional().nullable(),
});

export const invoicePaymentCreateSchema = invoicePaymentSchema
  .omit({
    id: true,
    tenant_id: true,
    invoice_id: true,
    patient_id: true,
    created_at: true,
    created_by: true,
  })
  .extend({
    paid_at: dateTimeStringSchema.optional(),
    reference: z.string().trim().max(120).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
    idempotency_key: z.string().trim().min(8).max(120).optional(),
  });

export const invoicePaymentCommandResultSchema = z.object({
  result_code: z.string(),
  retryable: z.boolean(),
  idempotency_replay: z.boolean(),
  message: z.string().nullable(),
  invoice: invoiceSchema.nullable(),
  payment: invoicePaymentSchema.nullable(),
});

export const invoiceListParamsSchema = listParamsSchema;

export const invoiceSummarySchema = z.object({
  total_count: z.coerce.number().int().min(0),
  paid_count: z.coerce.number().int().min(0),
  paid_amount: z.coerce.number().min(0),
  pending_amount: z.coerce.number().min(0),
});

export const billingReconciliationSeveritySchema = z.enum(["critical", "warning"]);
export const billingReconciliationFindingStatusSchema = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "INVESTIGATING",
  "RESOLVED",
  "FALSE_POSITIVE",
]);

export const billingReconciliationRunSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  window_start: dateTimeStringSchema,
  window_end: dateTimeStringSchema,
  checked_invoice_count: z.coerce.number().int().min(0),
  checked_payment_count: z.coerce.number().int().min(0),
  finding_count: z.coerce.number().int().min(0),
  critical_count: z.coerce.number().int().min(0),
  warning_count: z.coerce.number().int().min(0),
  status: z.enum(["completed", "failed"]),
  request_trace_id: z.string().optional().nullable(),
  operation_trace_id: z.string().optional().nullable(),
  workflow_trace_id: z.string().optional().nullable(),
  causal_parent_id: z.string().optional().nullable(),
  failure_kind: z.string().optional().nullable(),
  runtime_effect: z.string().optional().nullable(),
  recovery_contract: z.record(z.unknown()).optional().nullable(),
  evidence_metadata: z.record(z.unknown()).optional().nullable(),
  started_at: dateTimeStringSchema,
  completed_at: dateTimeStringSchema,
  created_at: dateTimeStringSchema,
});

export const billingReconciliationFindingSchema = z.object({
  id: uuidSchema,
  run_id: uuidSchema,
  tenant_id: uuidSchema,
  invoice_id: uuidSchema.optional().nullable(),
  payment_id: uuidSchema.optional().nullable(),
  idempotency_id: uuidSchema.optional().nullable(),
  finding_code: z.string().trim().min(1),
  severity: billingReconciliationSeveritySchema,
  status: billingReconciliationFindingStatusSchema,
  evidence: z.record(z.unknown()).default({}),
  request_trace_id: z.string().optional().nullable(),
  operation_trace_id: z.string().optional().nullable(),
  workflow_trace_id: z.string().optional().nullable(),
  causal_parent_id: z.string().optional().nullable(),
  failure_kind: z.string().optional().nullable(),
  runtime_effect: z.string().optional().nullable(),
  recovery_contract: z.record(z.unknown()).optional().nullable(),
  evidence_metadata: z.record(z.unknown()).optional().nullable(),
  detected_at: dateTimeStringSchema,
  resolved_at: dateTimeStringSchema.optional().nullable(),
});

export const billingReconciliationSummarySchema = z.object({
  run_id: uuidSchema.optional().nullable(),
  tenant_id: uuidSchema,
  checked_invoice_count: z.coerce.number().int().min(0),
  checked_payment_count: z.coerce.number().int().min(0),
  finding_count: z.coerce.number().int().min(0),
  critical_count: z.coerce.number().int().min(0),
  warning_count: z.coerce.number().int().min(0),
  dry_run: z.boolean(),
  completed_at: dateTimeStringSchema,
});
