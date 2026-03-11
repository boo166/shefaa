import { z } from "zod";
import { medicalRecordWithDoctorSchema } from "@/domain/patient/patient.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { medicalRecordsRepository } from "./medicalRecords.repository";

export const medicalRecordsService = {
  async listByPatient(patientId: string) {
    try {
      const parsedId = uuidSchema.parse(patientId);
      const { tenantId } = getTenantContext();
      const result = await medicalRecordsRepository.listByPatient(parsedId, tenantId);
      return z.array(medicalRecordWithDoctorSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load medical records");
    }
  },
};
