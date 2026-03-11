import { z } from "zod";
import {
  labOrderWithDoctorSchema,
  labOrderWithPatientDoctorSchema,
  labResultCreateSchema,
  labResultListParamsSchema,
  labResultSchema,
  labResultUpdateSchema,
} from "@/domain/lab/lab.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type { LabResultCreateInput, LabResultListParams, LabResultUpdateInput } from "@/domain/lab/lab.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { labRepository } from "./lab.repository";

const labStatusCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

export const labService = {
  async listPaged(params: LabResultListParams) {
    try {
      const parsed = labResultListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      const result = await labRepository.listPaged(parsed, tenantId);
      const data = z.array(labResultSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load lab orders");
    }
  },
  async listPagedWithRelations(params: LabResultListParams) {
    try {
      const parsed = labResultListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      const result = await labRepository.listPagedWithRelations(parsed, tenantId);
      const data = z.array(labOrderWithPatientDoctorSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load lab orders");
    }
  },
  async countByStatus() {
    try {
      const { tenantId } = getTenantContext();
      const result = await labRepository.countByStatus(tenantId);
      return labStatusCountsSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load lab order counts");
    }
  },
  async listByPatient(patientId: string) {
    try {
      const parsedId = uuidSchema.parse(patientId);
      const { tenantId } = getTenantContext();
      const result = await labRepository.listByPatient(parsedId, tenantId);
      return z.array(labOrderWithDoctorSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load patient lab orders");
    }
  },
  async create(input: LabResultCreateInput) {
    try {
      const parsed = labResultCreateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await labRepository.create(parsed, tenantId);
      return labResultSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to create lab order");
    }
  },
  async update(id: string, input: LabResultUpdateInput) {
    try {
      const parsedId = uuidSchema.parse(id);
      const parsed = labResultUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await labRepository.update(parsedId, parsed, tenantId);
      return labResultSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to update lab order");
    }
  },
};
