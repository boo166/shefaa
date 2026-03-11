import type { z } from "zod";
import {
  invoiceSchema,
  invoiceWithPatientSchema,
  invoiceCreateSchema,
  invoiceUpdateSchema,
  invoiceListParamsSchema,
  invoiceSummarySchema,
} from "./billing.schema";

export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceWithPatient = z.infer<typeof invoiceWithPatientSchema>;
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;
export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
export type InvoiceListParams = z.infer<typeof invoiceListParamsSchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
