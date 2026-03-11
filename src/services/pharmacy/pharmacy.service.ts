import { z } from "zod";
import {
  medicationCreateSchema,
  medicationListParamsSchema,
  medicationSchema,
  medicationSummarySchema,
  medicationUpdateSchema,
} from "@/domain/pharmacy/medication.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type {
  MedicationCreateInput,
  MedicationListParams,
  MedicationUpdateInput,
} from "@/domain/pharmacy/medication.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { pharmacyRepository } from "./pharmacy.repository";

export const pharmacyService = {
  async listPaged(params: MedicationListParams) {
    try {
      const parsed = medicationListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      const result = await pharmacyRepository.listPaged(parsed, tenantId);
      const data = z.array(medicationSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load medications");
    }
  },
  async getSummary() {
    try {
      const { tenantId } = getTenantContext();
      const result = await pharmacyRepository.getSummary(tenantId);
      return medicationSummarySchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load medication summary");
    }
  },
  async create(input: MedicationCreateInput) {
    try {
      const parsed = medicationCreateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await pharmacyRepository.create(parsed, tenantId);
      return medicationSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to create medication");
    }
  },
  async update(id: string, input: MedicationUpdateInput) {
    try {
      const parsedId = uuidSchema.parse(id);
      const parsed = medicationUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await pharmacyRepository.update(parsedId, parsed, tenantId);
      return medicationSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to update medication");
    }
  },
  async remove(id: string) {
    try {
      const parsedId = uuidSchema.parse(id);
      const { tenantId } = getTenantContext();
      await pharmacyRepository.remove(parsedId, tenantId);
    } catch (err) {
      throw toServiceError(err, "Failed to delete medication");
    }
  },
};
