import type {
  MedicalRecord,
  MedicalRecordCreateInput,
  MedicalRecordUpdateInput,
  MedicalRecordWithDoctor,
} from "@/domain/patient/patient.types";
import type { LimitOffsetParams } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { commandTraceParams } from "@/services/operational/commandTrace";
import { ServiceError } from "@/services/supabase/errors";

const MEDICAL_RECORD_COLUMNS =
  "id, tenant_id, patient_id, doctor_id, record_date, diagnosis, notes, record_type, created_at, doctors(full_name)";

const RECORD_READ_CAPS = [Capabilities.records.view, Capabilities.records.manage] as const;
const RECORD_WRITE_CAPS = [Capabilities.records.manage] as const;

function recordCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
  requiredCapabilities?: string[],
): PlatformRepositoryContext {
  return { action, classification, tenantScoped: true, tenantId, requiredCapabilities };
}

export interface MedicalRecordsRepository {
  listByPatient(patientId: string, tenantId: string, params?: LimitOffsetParams): Promise<MedicalRecordWithDoctor[]>;
  create(input: MedicalRecordCreateInput, tenantId: string, userId?: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<MedicalRecordWithDoctor>;
  update(id: string, input: MedicalRecordUpdateInput, tenantId: string, userId?: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<MedicalRecordWithDoctor>;
  remove(id: string, tenantId: string, userId?: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<MedicalRecord>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

type MedicalRecordOperation = "create" | "amend" | "delete";

type MedicalRecordCommandResult = {
  result_code: string;
  retryable: boolean;
  idempotency_replay: boolean;
  message: string | null;
  record: MedicalRecordWithDoctor | null;
};

function recordPayload(input: Partial<MedicalRecordCreateInput & MedicalRecordUpdateInput>) {
  const payload: Record<string, unknown> = {};
  if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
  if (input.doctor_id !== undefined) payload.doctor_id = input.doctor_id;
  if (input.record_date !== undefined) payload.record_date = input.record_date;
  if (input.diagnosis !== undefined) payload.diagnosis = input.diagnosis;
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.record_type !== undefined) payload.record_type = input.record_type;
  return payload;
}

function recordCommandRequestHash(
  operation: MedicalRecordOperation,
  recordId: string | null,
  tenantId: string,
  payload: Record<string, unknown>,
) {
  return JSON.stringify({ operation, recordId, tenantId, payload });
}

async function commandMedicalRecordLifecycle(input: {
  operation: MedicalRecordOperation;
  recordId?: string | null;
  payload?: Record<string, unknown>;
  tenantId: string;
  userId?: string | null;
  idempotencyKey?: string | null;
  requestHash?: string | null;
  trace?: PlatformRepositoryContext["trace"];
}): Promise<MedicalRecordCommandResult> {
  const { data, error } = await platformRepository.rpc("command_medical_record_lifecycle", {
    p_operation: input.operation,
    p_record_id: input.recordId ?? null,
    p_tenant_id: input.tenantId,
    p_payload: input.payload ?? {},
    p_idempotency_key: input.idempotencyKey ?? null,
    p_request_hash: input.requestHash ?? null,
    p_user_id: input.userId ?? null,
    ...commandTraceParams(input.trace),
  }, recordCtx(input.tenantId, `medicalRecords.${input.operation}`, "critical", [...RECORD_WRITE_CAPS]));

  if (error) {
    throw new ServiceError(error.message ?? "Failed to run medical record command", {
      code: error.code,
      details: error,
    });
  }

  const row = (data as any)?.[0];
  if (!row) {
    throw new ServiceError("Medical record command returned no result", { code: "MEDICAL_RECORD_COMMAND_EMPTY_RESULT" });
  }

  return {
    result_code: row.result_code,
    retryable: Boolean(row.retryable),
    idempotency_replay: Boolean(row.idempotency_replay),
    message: row.message ?? null,
    record: (row.record ?? null) as MedicalRecordWithDoctor | null,
  };
}

export const medicalRecordsRepository: MedicalRecordsRepository = {
  async listByPatient(patientId, tenantId, params) {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const { data, error } = await platformRepository
      .from("medical_records", recordCtx(tenantId, "medicalRecords.listByPatient", "readonly", [...RECORD_READ_CAPS]))
      .select(MEDICAL_RECORD_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .order("record_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load medical records", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as MedicalRecordWithDoctor[];
  },
  async create(input, tenantId, userId, trace) {
    const payload = recordPayload(input);
    const command = await commandMedicalRecordLifecycle({
      operation: "create",
      tenantId,
      userId,
      payload,
      idempotencyKey: `medical_record_create:${tenantId}:${input.patient_id}:${input.doctor_id}:${input.record_date ?? ""}:${input.record_type ?? "progress_note"}`,
      requestHash: recordCommandRequestHash("create", null, tenantId, payload),
      trace,
    });
    if (!command.record) {
      throw new ServiceError(command.message ?? "Medical record create command returned no record", {
        code: "MEDICAL_RECORD_CREATE_EMPTY_RESULT",
        details: { resultCode: command.result_code, retryable: command.retryable },
      });
    }
    return command.record;
  },
  async update(id, input, tenantId, userId, trace) {
    const payload = recordPayload(input);
    const command = await commandMedicalRecordLifecycle({
      operation: "amend",
      recordId: id,
      tenantId,
      userId,
      payload,
      idempotencyKey: `medical_record_amend:${id}:${JSON.stringify(payload)}`,
      requestHash: recordCommandRequestHash("amend", id, tenantId, payload),
      trace,
    });
    if (!command.record) {
      throw new ServiceError(command.message ?? "Medical record amend command returned no record", {
        code: "MEDICAL_RECORD_AMEND_EMPTY_RESULT",
        details: { resultCode: command.result_code, retryable: command.retryable },
      });
    }
    return command.record;
  },
  async remove(id, tenantId, userId, trace) {
    const payload = {};
    const command = await commandMedicalRecordLifecycle({
      operation: "delete",
      recordId: id,
      tenantId,
      userId,
      payload,
      idempotencyKey: `medical_record_delete:${id}`,
      requestHash: recordCommandRequestHash("delete", id, tenantId, payload),
      trace,
    });
    if (!command.record) {
      throw new ServiceError(command.message ?? "Medical record delete command returned no record", {
        code: "MEDICAL_RECORD_DELETE_EMPTY_RESULT",
        details: { resultCode: command.result_code, retryable: command.retryable },
      });
    }
    return command.record;
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
      requiredCapabilities: [...RECORD_READ_CAPS],
    };
  },
};
