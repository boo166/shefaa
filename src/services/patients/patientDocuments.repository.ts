import type { PatientDocument, PatientDocumentCreateInput } from "@/domain/patient/patient.types";
import type { LimitOffsetParams } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { commandTraceParams } from "@/services/operational/commandTrace";
import { ServiceError } from "@/services/supabase/errors";

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
  createMetadata(input: PatientDocumentCreateInput, tenantId: string, userId?: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<PatientDocument>;
  listByPatient(patientId: string, tenantId: string, params?: LimitOffsetParams): Promise<PatientDocument[]>;
  recordAccess(documentId: string, tenantId: string, userId?: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<PatientDocument | null>;
  archive(documentId: string, tenantId: string, userId: string, trace?: PlatformRepositoryContext["trace"]): Promise<PatientDocument | null>;
  restore(documentId: string, tenantId: string, userId?: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<PatientDocument | null>;
  remove(documentId: string, tenantId: string, userId: string, trace?: PlatformRepositoryContext["trace"]): Promise<{ file_path: string } | null>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

type PatientDocumentOperation = "create" | "access" | "archive" | "restore" | "delete";

type PatientDocumentCommandResult = {
  result_code: string;
  retryable: boolean;
  idempotency_replay: boolean;
  message: string | null;
  document: PatientDocument | null;
};

function documentCommandRequestHash(
  operation: PatientDocumentOperation,
  documentId: string | null,
  tenantId: string,
  payload: Record<string, unknown>,
) {
  return JSON.stringify({ operation, documentId, tenantId, payload });
}

async function commandPatientDocumentLifecycle(input: {
  operation: PatientDocumentOperation;
  documentId?: string | null;
  payload?: Record<string, unknown>;
  tenantId: string;
  userId?: string | null;
  idempotencyKey?: string | null;
  requestHash?: string | null;
  trace?: PlatformRepositoryContext["trace"];
}): Promise<PatientDocumentCommandResult> {
  const { data, error } = await platformRepository.rpc("command_patient_document_lifecycle", {
    p_operation: input.operation,
    p_document_id: input.documentId ?? null,
    p_tenant_id: input.tenantId,
    p_payload: input.payload ?? {},
    p_idempotency_key: input.idempotencyKey ?? null,
    p_request_hash: input.requestHash ?? null,
    p_user_id: input.userId ?? null,
    ...commandTraceParams(input.trace),
  }, docsCtx(input.tenantId, `patientDocuments.${input.operation}`, "critical", [...DOC_WRITE_CAPS]));

  if (error) {
    throw new ServiceError(error.message ?? "Failed to run patient document command", {
      code: error.code,
      details: error,
    });
  }

  const row = (data as any)?.[0];
  if (!row) {
    throw new ServiceError("Patient document command returned no result", { code: "PATIENT_DOCUMENT_COMMAND_EMPTY_RESULT" });
  }

  return {
    result_code: row.result_code,
    retryable: Boolean(row.retryable),
    idempotency_replay: Boolean(row.idempotency_replay),
    message: row.message ?? null,
    document: (row.document ?? null) as PatientDocument | null,
  };
}

export const patientDocumentsRepository: PatientDocumentsRepository = {
  async createMetadata(input, tenantId, userId, trace) {
    const payload = {
      patient_id: input.patient_id,
      file_name: input.file_name,
      file_path: input.file_path,
      file_size: input.file_size ?? 0,
      file_type: input.file_type ?? "application/octet-stream",
      uploaded_by: input.uploaded_by ?? userId,
      notes: input.notes ?? null,
    };

    const command = await commandPatientDocumentLifecycle({
      operation: "create",
      tenantId,
      userId,
      payload,
      idempotencyKey: `patient_document_create:${tenantId}:${input.file_path}`,
      requestHash: documentCommandRequestHash("create", null, tenantId, payload),
      trace,
    });
    if (!command.document) {
      throw new ServiceError(command.message ?? "Patient document create command returned no document", {
        code: "PATIENT_DOCUMENT_CREATE_EMPTY_RESULT",
        details: { resultCode: command.result_code, retryable: command.retryable },
      });
    }
    return command.document;
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
  async recordAccess(documentId, tenantId, userId, trace) {
    const command = await commandPatientDocumentLifecycle({
      operation: "access",
      documentId,
      tenantId,
      userId,
      payload: {},
      idempotencyKey: null,
      requestHash: documentCommandRequestHash("access", documentId, tenantId, {}),
      trace,
    });
    return command.document;
  },
  async archive(documentId, tenantId, userId, trace) {
    const payload = { deleted_by: userId };
    const command = await commandPatientDocumentLifecycle({
      operation: "archive",
      documentId,
      tenantId,
      userId,
      payload,
      idempotencyKey: `patient_document_archive:${documentId}`,
      requestHash: documentCommandRequestHash("archive", documentId, tenantId, payload),
      trace,
    });
    return command.document;
  },
  async restore(documentId, tenantId, userId, trace) {
    const payload = {};
    const command = await commandPatientDocumentLifecycle({
      operation: "restore",
      documentId,
      tenantId,
      userId,
      payload,
      idempotencyKey: `patient_document_restore:${documentId}`,
      requestHash: documentCommandRequestHash("restore", documentId, tenantId, payload),
      trace,
    });
    return command.document;
  },
  async remove(documentId, tenantId, userId, trace) {
    const archived = await patientDocumentsRepository.archive(documentId, tenantId, userId, trace);
    return archived ? { file_path: archived.file_path } : null;
  },
  describe() {
    return {
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: ["patients.record.manage"],
    };
  },
};
