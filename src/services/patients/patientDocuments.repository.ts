import type { PatientDocument, PatientDocumentCreateInput } from "@/domain/patient/patient.types";
import type { LimitOffsetParams } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const PATIENT_DOCUMENT_COLUMNS =
  "id, patient_id, tenant_id, file_name, file_path, file_size, file_type, uploaded_by, notes, deleted_at, deleted_by, created_at";

const DOC_READ_CAPS = [
  Capabilities.patients.view,
  Capabilities.patients.manage,
  Capabilities.records.view,
  Capabilities.records.manage,
] as const;
const DOC_WRITE_CAPS = [Capabilities.patients.manage, Capabilities.records.manage] as const;

function docsCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
  requiredCapabilities?: string[],
): PlatformRepositoryContext {
  return { action, classification, tenantScoped: true, tenantId, requiredCapabilities };
}

export interface PatientDocumentsRepository {
  createMetadata(input: PatientDocumentCreateInput, tenantId: string): Promise<PatientDocument>;
  listByPatient(patientId: string, tenantId: string, params?: LimitOffsetParams): Promise<PatientDocument[]>;
  archive(documentId: string, tenantId: string, userId: string): Promise<PatientDocument | null>;
  restore(documentId: string, tenantId: string): Promise<PatientDocument | null>;
  remove(documentId: string, tenantId: string, userId: string): Promise<{ file_path: string } | null>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
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

    const result = await platformRepository
      .from("patient_documents", docsCtx(tenantId, "patientDocuments.createMetadata", "critical", [...DOC_WRITE_CAPS]))
      .insert(payload)
      .select(PATIENT_DOCUMENT_COLUMNS)
      .single();

    return assertOk(result) as PatientDocument;
  },
  async listByPatient(patientId, tenantId, params) {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const { data, error } = await platformRepository
      .from("patient_documents", docsCtx(tenantId, "patientDocuments.listByPatient", "readonly", [...DOC_READ_CAPS]))
      .select(PATIENT_DOCUMENT_COLUMNS)
      .eq("patient_id", patientId)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient documents", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as PatientDocument[];
  },
  async archive(documentId, tenantId, userId) {
    const result = await platformRepository
      .from("patient_documents", docsCtx(tenantId, "patientDocuments.archive", "critical", [...DOC_WRITE_CAPS]))
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .select(PATIENT_DOCUMENT_COLUMNS)
      .single();

    return assertOk(result) as PatientDocument | null;
  },
  async restore(documentId, tenantId) {
    const result = await platformRepository
      .from("patient_documents", docsCtx(tenantId, "patientDocuments.restore", "critical", [...DOC_WRITE_CAPS]))
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", documentId)
      .eq("tenant_id", tenantId)
      .select(PATIENT_DOCUMENT_COLUMNS)
      .single();

    return assertOk(result) as PatientDocument | null;
  },
  async remove(documentId, tenantId, userId) {
    const archived = await patientDocumentsRepository.archive(documentId, tenantId, userId);
    return archived ? { file_path: archived.file_path } : null;
  },
  describe() {
    return {
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: false,
      recoveryAware: false,
      evidenceAware: false,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: ["patients.record.manage"],
    };
  },
};
