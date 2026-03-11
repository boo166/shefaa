import type { PatientDocument, PatientDocumentCreateInput } from "@/domain/patient/patient.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const PATIENT_DOCUMENT_COLUMNS =
  "id, patient_id, tenant_id, file_name, file_path, file_size, file_type, uploaded_by, notes, created_at";

export interface PatientDocumentsRepository {
  createMetadata(input: PatientDocumentCreateInput, tenantId: string): Promise<PatientDocument>;
  listByPatient(patientId: string, tenantId: string): Promise<PatientDocument[]>;
  remove(documentId: string, tenantId: string): Promise<{ file_path: string } | null>;
}

export const patientDocumentsRepository: PatientDocumentsRepository = {
  async createMetadata(input, tenantId) {
    const payload = {
      patient_id: input.patient_id,
      tenant_id: tenantId,
      file_name: input.file_name,
      file_path: input.file_path,
      file_size: input.file_size ?? 0,
      file_type: input.file_type ?? "application/octet-stream",
      uploaded_by: input.uploaded_by,
      notes: input.notes ?? null,
    };

    const result = await supabase
      .from("patient_documents")
      .insert(payload)
      .select(PATIENT_DOCUMENT_COLUMNS)
      .single();

    return assertOk(result) as PatientDocument;
  },
  async listByPatient(patientId, tenantId) {
    const { data, error } = await supabase
      .from("patient_documents")
      .select(PATIENT_DOCUMENT_COLUMNS)
      .eq("patient_id", patientId)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient documents", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as PatientDocument[];
  },
  async remove(documentId, tenantId) {
    const result = await supabase
      .from("patient_documents")
      .delete()
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .select("file_path")
      .single();

    return assertOk(result) as { file_path: string } | null;
  },
};
