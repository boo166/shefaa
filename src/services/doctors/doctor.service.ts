import { z } from "zod";
import { doctorCreateSchema, doctorListParamsSchema, doctorSchema, doctorUpdateSchema } from "@/domain/doctor/doctor.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type { DoctorCreateInput, DoctorListParams, DoctorUpdateInput } from "@/domain/doctor/doctor.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { doctorRepository } from "./doctor.repository";

export const doctorService = {
  async listPaged(params: DoctorListParams) {
    try {
      const parsed = doctorListParamsSchema.parse(params);
      const { tenantId } = getTenantContext();
      const result = await doctorRepository.listPaged(parsed, tenantId);
      const data = z.array(doctorSchema).parse(result.data);
      const count = z.number().int().nonnegative().parse(result.count);
      return { data, count };
    } catch (err) {
      throw toServiceError(err, "Failed to load doctors");
    }
  },
  async create(input: DoctorCreateInput) {
    try {
      const parsed = doctorCreateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await doctorRepository.create(parsed, tenantId);
      return doctorSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to create doctor");
    }
  },
  async update(id: string, input: DoctorUpdateInput) {
    try {
      const parsedId = uuidSchema.parse(id);
      const parsed = doctorUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await doctorRepository.update(parsedId, parsed, tenantId);
      return doctorSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to update doctor");
    }
  },
  async remove(id: string) {
    try {
      const parsedId = uuidSchema.parse(id);
      const { tenantId } = getTenantContext();
      return await doctorRepository.remove(parsedId, tenantId);
    } catch (err) {
      throw toServiceError(err, "Failed to delete doctor");
    }
  },
};
