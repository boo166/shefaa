import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema } from "../shared/date.schema";
import { listParamsSchema } from "../shared/pagination.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const invoiceStatusEnum = z.enum(["paid", "pending", "overdue"]);

export const invoiceSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  patient_id: uuidSchema,
  invoice_code: z.string().trim().min(3).max(20),
  service: z.string().trim().min(1).max(200),
  amount: z.coerce.number().min(0),
  invoice_date: dateStringSchema,
  status: invoiceStatusEnum,
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const invoiceWithPatientSchema = invoiceSchema.extend({
  patients: z.object({ full_name: z.string().trim().min(1) }).optional().nullable(),
});

export const invoiceCreateSchema = invoiceSchema
  .omit({
    id: true,
    tenant_id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    status: invoiceStatusEnum.optional(),
    invoice_date: dateStringSchema.optional(),
  });

export const invoiceUpdateSchema = invoiceCreateSchema.partial();

export const invoiceListParamsSchema = listParamsSchema;

export const invoiceSummarySchema = z.object({
  total_count: z.coerce.number().int().min(0),
  paid_count: z.coerce.number().int().min(0),
  paid_amount: z.coerce.number().min(0),
  pending_amount: z.coerce.number().min(0),
});
