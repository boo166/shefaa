import type { z } from "zod";
import {
  invoiceSchema,
  invoiceWithPatientSchema,
  invoiceCreateSchema,
  invoiceUpdateSchema,
  invoicePaymentSchema,
  invoicePaymentCreateSchema,
  invoicePaymentCommandResultSchema,
  invoiceListParamsSchema,
  invoiceSummarySchema,
  billingReconciliationRunSchema,
  billingReconciliationFindingSchema,
  billingReconciliationSummarySchema,
} from "./billing.schema";

export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceWithPatient = z.infer<typeof invoiceWithPatientSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
export type InvoicePayment = z.infer<typeof invoicePaymentSchema>;
export type InvoicePaymentCreateInput = z.infer<typeof invoicePaymentCreateSchema>;
export type InvoicePaymentCommandResult = z.infer<typeof invoicePaymentCommandResultSchema>;
export type InvoiceListParams = z.infer<typeof invoiceListParamsSchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type BillingReconciliationRun = z.infer<typeof billingReconciliationRunSchema>;
export type BillingReconciliationFinding = z.infer<typeof billingReconciliationFindingSchema>;
export type BillingReconciliationSummary = z.infer<typeof billingReconciliationSummarySchema>;
