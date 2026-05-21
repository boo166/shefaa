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
import { ServiceError } from "@/services/supabase/errors";

const MEDICAL_RECORD_BASE_COLUMNS =
  "id, tenant_id, patient_id, doctor_id, record_date, diagnosis, notes, record_type, created_at";
const MEDICAL_RECORD_COLUMNS = `${MEDICAL_RECORD_BASE_COLUMNS}, doctors(full_name)`;

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
  create(input: MedicalRecordCreateInput, tenantId: string): Promise<MedicalRecordWithDoctor>;
  update(id: string, input: MedicalRecordUpdateInput, tenantId: string): Promise<MedicalRecordWithDoctor>;
  remove(id: string, tenantId: string): Promise<MedicalRecord>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
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
  async create(input, tenantId) {
    const payload = {
      tenant_id: tenantId,
      patient_id: input.patient_id,
      doctor_id: input.doctor_id,
      record_date: input.record_date ?? undefined,
      diagnosis: input.diagnosis ?? null,
      notes: input.notes ?? null,
      record_type: input.record_type ?? undefined,
    };

    const { data, error } = await platformRepository
      .from("medical_records", recordCtx(tenantId, "medicalRecords.create", "critical", [...RECORD_WRITE_CAPS]))
      .insert(payload)
      .select(MEDICAL_RECORD_COLUMNS)
      .single();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to create medical record", {
        code: error.code,
        details: error,
      });
    }

    return data as MedicalRecordWithDoctor;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};
    if (input.record_date !== undefined) payload.record_date = input.record_date;
    if (input.diagnosis !== undefined) payload.diagnosis = input.diagnosis;
    if (input.notes !== undefined) payload.notes = input.notes;
    if (input.record_type !== undefined) payload.record_type = input.record_type;

    const { data, error } = await platformRepository
      .from("medical_records", recordCtx(tenantId, "medicalRecords.update", "critical", [...RECORD_WRITE_CAPS]))
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(MEDICAL_RECORD_COLUMNS)
      .single();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update medical record", {
        code: error.code,
        details: error,
      });
    }

    return data as MedicalRecordWithDoctor;
  },
  async remove(id, tenantId) {
    const { data, error } = await platformRepository
      .from("medical_records", recordCtx(tenantId, "medicalRecords.remove", "critical", [...RECORD_WRITE_CAPS]))
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(MEDICAL_RECORD_BASE_COLUMNS)
      .single();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to delete medical record", {
        code: error.code,
        details: error,
      });
    }

    return data as MedicalRecord;
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
      requiredCapabilities: [...RECORD_READ_CAPS],
    };
  },
};
