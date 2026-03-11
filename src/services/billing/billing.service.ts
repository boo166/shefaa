import { z } from "zod";
import {
  invoiceCreateSchema,
  invoiceListParamsSchema,
  invoiceSchema,
  invoiceSummarySchema,
  invoiceUpdateSchema,
  invoiceWithPatientSchema,
} from "@/domain/billing/billing.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type { InvoiceCreateInput, InvoiceListParams, InvoiceUpdateInput } from "@/domain/billing/billing.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { billingRepository } from "./billing.repository";

export const billingService = {
  async listPaged(params: InvoiceListParams) {
    try {
      const parsed = invoiceListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      const result = await billingRepository.listPaged(parsed, tenantId);
      const data = z.array(invoiceSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load invoices");
    }
  },
  async listPagedWithRelations(params: InvoiceListParams) {
    try {
      const parsed = invoiceListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      const result = await billingRepository.listPagedWithRelations(parsed, tenantId);
      const data = z.array(invoiceWithPatientSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load invoices");
    }
  },
  async getSummary() {
    try {
      const { tenantId } = getTenantContext();
      const result = await billingRepository.getSummary(tenantId);
      return invoiceSummarySchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load invoice summary");
    }
  },
  async countInRange(start: string, end: string) {
    try {
      const { tenantId } = getTenantContext();
      const result = await billingRepository.countInRange(start, end, tenantId);
      return z.number().int().nonnegative().parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load invoices");
    }
  },
  async listByPatient(patientId: string) {
    try {
      const parsedId = uuidSchema.parse(patientId);
      const { tenantId } = getTenantContext();
      const result = await billingRepository.listByPatient(parsedId, tenantId);
      return z.array(invoiceSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load patient invoices");
    }
  },
  async create(input: InvoiceCreateInput) {
    try {
      const parsed = invoiceCreateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await billingRepository.create(parsed, tenantId);
      return invoiceSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to create invoice");
    }
  },
  async update(id: string, input: InvoiceUpdateInput) {
    try {
      const parsedId = uuidSchema.parse(id);
      const parsed = invoiceUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await billingRepository.update(parsedId, parsed, tenantId);
      return invoiceSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to update invoice");
    }
  },
};
