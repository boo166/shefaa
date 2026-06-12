import type { Patient, PatientCreateInput, PatientUpdateInput, PatientListParams } from "@/domain/patient/patient.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { commandTraceParams } from "@/services/operational/commandTrace";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const PATIENT_COLUMNS =
  "id, tenant_id, patient_code, full_name, date_of_birth, gender, blood_type, phone, email, address, insurance_provider, status, deleted_at, deleted_by, created_at, updated_at";

const SEARCH_COLUMNS = ["patient_code", "full_name", "phone", "email"];
const SORTABLE_COLUMNS = new Set([
  "created_at",
  "updated_at",
  "full_name",
  "patient_code",
  "date_of_birth",
  "status",
]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

const PATIENT_READ_CAPS = [Capabilities.patients.view, Capabilities.patients.manage] as const;
const PATIENT_WRITE_CAPS = [Capabilities.patients.manage] as const;

function patientCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
  requiredCapabilities?: string[],
): PlatformRepositoryContext {
  return { action, classification, tenantScoped: true, tenantId, requiredCapabilities };
}

export interface PatientRepository {
  listPaged(params: PatientListParams, tenantId: string): Promise<PagedResult<Patient>>;
  getById(id: string, tenantId: string): Promise<Patient>;
  create(input: PatientCreateInput, tenantId: string, userId?: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<Patient>;
  update(
    id: string,
    input: PatientUpdateInput,
    tenantId: string,
    expectedUpdatedAt?: string,
    userId?: string | null,
    trace?: PlatformRepositoryContext["trace"],
  ): Promise<Patient | null>;
  findByNameAndDOB(fullName: string, dateOfBirth: string, tenantId: string): Promise<Pick<Patient, "id" | "patient_code" | "full_name" | "date_of_birth">[]>;
  hasActiveAppointments(patientId: string, tenantId: string): Promise<boolean>;
  archive(id: string, tenantId: string, userId: string, trace?: PlatformRepositoryContext["trace"]): Promise<Patient>;
  restore(id: string, tenantId: string, userId?: string | null, trace?: PlatformRepositoryContext["trace"]): Promise<Patient>;
  deleteBulk(ids: string[], tenantId: string, userId: string, trace?: PlatformRepositoryContext["trace"]): Promise<void>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

type PatientLifecycleOperation = "create" | "update" | "archive" | "restore" | "bulk_archive";

type PatientLifecycleCommandResult = {
  result_code: string;
  retryable: boolean;
  idempotency_replay: boolean;
  message: string | null;
  patient: Patient | null;
};

function patientPayload(input: Partial<PatientCreateInput & PatientUpdateInput>) {
  const payload: Record<string, unknown> = {};
  if (input.full_name !== undefined) payload.full_name = input.full_name;
  if (input.date_of_birth !== undefined) payload.date_of_birth = input.date_of_birth;
  if (input.gender !== undefined) payload.gender = input.gender;
  if (input.blood_type !== undefined) payload.blood_type = input.blood_type;
  if (input.phone !== undefined) payload.phone = input.phone;
  if (input.email !== undefined) payload.email = input.email;
  if (input.address !== undefined) payload.address = input.address;
  if (input.insurance_provider !== undefined) payload.insurance_provider = input.insurance_provider;
  if (input.status !== undefined) payload.status = input.status;
  return payload;
}

function patientCommandRequestHash(
  operation: PatientLifecycleOperation,
  patientId: string | null,
  tenantId: string,
  payload: Record<string, unknown>,
) {
  return JSON.stringify({ operation, patientId, tenantId, payload });
}

async function commandPatientLifecycle(input: {
  operation: PatientLifecycleOperation;
  patientId?: string | null;
  payload?: Record<string, unknown>;
  tenantId: string;
  userId?: string | null;
  expectedUpdatedAt?: string | null;
  idempotencyKey?: string | null;
  requestHash?: string | null;
  trace?: PlatformRepositoryContext["trace"];
}): Promise<PatientLifecycleCommandResult> {
  const { data, error } = await platformRepository.rpc("command_patient_lifecycle", {
    p_operation: input.operation,
    p_patient_id: input.patientId ?? null,
    p_tenant_id: input.tenantId,
    p_payload: input.payload ?? {},
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_request_hash: input.requestHash ?? null,
    p_user_id: input.userId ?? null,
    ...commandTraceParams(input.trace),
  }, patientCtx(input.tenantId, `patients.${input.operation}`, "critical", [...PATIENT_WRITE_CAPS]));

  if (error) {
    throw new ServiceError(error.message ?? "Failed to run patient lifecycle command", {
      code: error.code,
      details: error,
    });
  }

  const row = (data as any)?.[0];
  if (!row) {
    throw new ServiceError("Patient lifecycle command returned no result", { code: "PATIENT_COMMAND_EMPTY_RESULT" });
  }

  return {
    result_code: row.result_code,
    retryable: Boolean(row.retryable),
    idempotency_replay: Boolean(row.idempotency_replay),
    message: row.message ?? null,
    patient: (row.patient ?? null) as Patient | null,
  };
}

export const patientRepository: PatientRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("patients", patientCtx(tenantId, "patients.listPaged", "readonly", [...PATIENT_READ_CAPS]))
      .select(PATIENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }

    if (searchTerm) {
      const escaped = escapeSearchTerm(searchTerm);
      const orFilter = SEARCH_COLUMNS
        .map((col) => `${col}.ilike.%${escaped}%`)
        .join(",");
      query = query.or(orFilter);
    }

    const sortColumn = params.sort?.column && SORTABLE_COLUMNS.has(params.sort.column)
      ? params.sort.column
      : "created_at";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patients", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as Patient[], count: count ?? 0 };
  },
  async getById(id, tenantId) {
    const result = await platformRepository
      .from("patients", patientCtx(tenantId, "patients.getById", "readonly", [...PATIENT_READ_CAPS]))
      .select(PATIENT_COLUMNS)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .single();

    return assertOk(result) as Patient;
  },
  async create(input, tenantId, userId, trace) {
    const payload = patientPayload(input);
    const command = await commandPatientLifecycle({
      operation: "create",
      tenantId,
      userId,
      payload,
      idempotencyKey: `patient_create:${tenantId}:${input.full_name}:${input.date_of_birth ?? ""}`,
      requestHash: patientCommandRequestHash("create", null, tenantId, payload),
      trace,
    });
    if (!command.patient) {
      throw new ServiceError(command.message ?? "Patient create command returned no patient", {
        code: "PATIENT_CREATE_EMPTY_RESULT",
        details: { resultCode: command.result_code, retryable: command.retryable },
      });
    }
    return command.patient;
  },
  async update(id, input, tenantId, expectedUpdatedAt, userId, trace) {
    const payload = patientPayload(input);

    if (Object.keys(payload).length === 0) {
      return patientRepository.getById(id, tenantId);
    }

    const command = await commandPatientLifecycle({
      operation: "update",
      patientId: id,
      tenantId,
      userId,
      payload,
      expectedUpdatedAt,
      idempotencyKey: expectedUpdatedAt ? `patient_update:${id}:${expectedUpdatedAt}` : null,
      requestHash: patientCommandRequestHash("update", id, tenantId, payload),
      trace,
    });
    if (command.result_code === "CONFLICT") {
      return null;
    }
    return command.patient;
  },
  async findByNameAndDOB(fullName, dateOfBirth, tenantId) {
    const { data, error } = await platformRepository
      .from("patients", patientCtx(tenantId, "patients.findByNameAndDOB", "readonly", [...PATIENT_READ_CAPS]))
      .select("id, patient_code, full_name, date_of_birth")
      .eq("tenant_id", tenantId)
      .eq("date_of_birth", dateOfBirth)
      .ilike("full_name", fullName)
      .is("deleted_at", null);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to check duplicates", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as Pick<Patient, "id" | "patient_code" | "full_name" | "date_of_birth">[];
  },
  async hasActiveAppointments(patientId, tenantId) {
    const { count, error } = await platformRepository
      .from("appointments", patientCtx(tenantId, "patients.hasActiveAppointments", "readonly", [...PATIENT_READ_CAPS]))
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .in("status", ["scheduled", "in_progress"]);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to check appointments", {
        code: error.code,
        details: error,
      });
    }

    return (count ?? 0) > 0;
  },
  async archive(id, tenantId, userId, trace) {
    const payload = { deleted_by: userId };
    const command = await commandPatientLifecycle({
      operation: "archive",
      patientId: id,
      tenantId,
      userId,
      payload,
      idempotencyKey: `patient_archive:${id}`,
      requestHash: patientCommandRequestHash("archive", id, tenantId, payload),
      trace,
    });
    if (!command.patient) {
      throw new ServiceError(command.message ?? "Patient archive command returned no patient", {
        code: "PATIENT_ARCHIVE_EMPTY_RESULT",
        details: { resultCode: command.result_code, retryable: command.retryable },
      });
    }
    return command.patient;
  },
  async restore(id, tenantId, userId, trace) {
    const payload = {};
    const command = await commandPatientLifecycle({
      operation: "restore",
      patientId: id,
      tenantId,
      userId,
      payload,
      idempotencyKey: `patient_restore:${id}`,
      requestHash: patientCommandRequestHash("restore", id, tenantId, payload),
      trace,
    });
    if (!command.patient) {
      throw new ServiceError(command.message ?? "Patient restore command returned no patient", {
        code: "PATIENT_RESTORE_EMPTY_RESULT",
        details: { resultCode: command.result_code, retryable: command.retryable },
      });
    }
    return command.patient;
  },
  async deleteBulk(ids, tenantId, userId, trace) {
    if (ids.length === 0) return;
    const payload = { patient_ids: ids, deleted_by: userId };
    await commandPatientLifecycle({
      operation: "bulk_archive",
      tenantId,
      userId,
      payload,
      idempotencyKey: `patient_bulk_archive:${tenantId}:${ids.join(",")}`,
      requestHash: patientCommandRequestHash("bulk_archive", null, tenantId, payload),
      trace,
    });
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
      requiredCapabilities: ["patients.record.manage", "patients.record.view"],
    };
  },
};
