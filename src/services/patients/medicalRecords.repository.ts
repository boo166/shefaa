import type { MedicalRecordWithDoctor } from "@/domain/patient/patient.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const MEDICAL_RECORD_COLUMNS =
  "id, tenant_id, patient_id, doctor_id, record_date, diagnosis, notes, record_type, created_at, doctors(full_name)";

export interface MedicalRecordsRepository {
  listByPatient(patientId: string, tenantId: string): Promise<MedicalRecordWithDoctor[]>;
}

export const medicalRecordsRepository: MedicalRecordsRepository = {
  async listByPatient(patientId, tenantId) {
    const { data, error } = await supabase
      .from("medical_records")
      .select(MEDICAL_RECORD_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .order("record_date", { ascending: false });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load medical records", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as MedicalRecordWithDoctor[];
  },
};
