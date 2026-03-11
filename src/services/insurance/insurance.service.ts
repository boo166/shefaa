import { z } from "zod";
import {
  insuranceClaimCreateSchema,
  insuranceClaimListParamsSchema,
  insuranceClaimSchema,
  insuranceClaimUpdateSchema,
  insuranceClaimWithPatientSchema,
  insuranceSummarySchema,
} from "@/domain/insurance/insurance.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type { InsuranceClaimCreateInput, InsuranceClaimListParams, InsuranceClaimUpdateInput } from "@/domain/insurance/insurance.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { insuranceRepository } from "./insurance.repository";

export const insuranceService = {
  async listPaged(params: InsuranceClaimListParams) {
    try {
      const parsed = insuranceClaimListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      const result = await insuranceRepository.listPaged(parsed, tenantId);
      const data = z.array(insuranceClaimSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load insurance claims");
    }
  },
  async listPagedWithRelations(params: InsuranceClaimListParams) {
    try {
      const parsed = insuranceClaimListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      const result = await insuranceRepository.listPagedWithRelations(parsed, tenantId);
      const data = z.array(insuranceClaimWithPatientSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load insurance claims");
    }
  },
  async getSummary() {
    try {
      const { tenantId } = getTenantContext();
      const result = await insuranceRepository.getSummary(tenantId);
      return insuranceSummarySchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load insurance summary");
    }
  },
  async create(input: InsuranceClaimCreateInput) {
    try {
      const parsed = insuranceClaimCreateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await insuranceRepository.create(parsed, tenantId);
      return insuranceClaimSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to create insurance claim");
    }
  },
  async update(id: string, input: InsuranceClaimUpdateInput) {
    try {
      const parsedId = uuidSchema.parse(id);
      const parsed = insuranceClaimUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await insuranceRepository.update(parsedId, parsed, tenantId);
      return insuranceClaimSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to update insurance claim");
    }
  },
};
