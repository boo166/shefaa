import { z } from "zod";
import {
  medicalRecordCreateSchema,
  medicalRecordUpdateSchema,
  medicalRecordWithDoctorSchema,
} from "@/domain/patient/patient.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type { LimitOffsetParams } from "@/domain/shared/pagination.types";
import type { MedicalRecordCreateInput, MedicalRecordUpdateInput } from "@/domain/patient/patient.types";
import { limitOffsetSchema } from "@/domain/shared/pagination.schema";
import { Capabilities } from "@/platform/authorization/capabilities";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { withAuthStaleGuard } from "@/services/auth/authContextSnapshot";
import { medicalRecordsRepository } from "./medicalRecords.repository";
import { requirePatientAccess } from "./patientAccess";

const RECORD_READ = [Capabilities.records.view, Capabilities.records.manage];
const RECORD_WRITE = [Capabilities.records.manage];

export const medicalRecordsService = {
  async listByPatient(patientId: string, params?: LimitOffsetParams) {
    try {
      const parsedId = uuidSchema.parse(patientId);
      const paging = limitOffsetSchema.parse(params ?? {});
      const { tenantId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...RECORD_READ] });
      const result = await medicalRecordsRepository.listByPatient(parsedId, tenantId, paging);
      return z.array(medicalRecordWithDoctorSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load medical records");
    }
  },
  async create(input: MedicalRecordCreateInput) {
    try {
      const parsed = medicalRecordCreateSchema.parse(input);
      const { tenantId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...RECORD_WRITE] });
      return await withAuthStaleGuard(async () => {
      const result = await medicalRecordsRepository.create(parsed, tenantId);
      return medicalRecordWithDoctorSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to create medical record");
    }
  },
  async update(id: string, input: MedicalRecordUpdateInput) {
    try {
      const parsedId = uuidSchema.parse(id);
      const parsed = medicalRecordUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...RECORD_WRITE] });
      return await withAuthStaleGuard(async () => {
      const result = await medicalRecordsRepository.update(parsedId, parsed, tenantId);
      return medicalRecordWithDoctorSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to update medical record");
    }
  },
  async remove(id: string) {
    try {
      const parsedId = uuidSchema.parse(id);
      const { tenantId } = getTenantContext();
      requirePatientAccess({ tenantId, anyOfCapabilities: [...RECORD_WRITE] });
      return await withAuthStaleGuard(async () => medicalRecordsRepository.remove(parsedId, tenantId));
    } catch (err) {
      throw toServiceError(err, "Failed to delete medical record");
    }
  },
};
