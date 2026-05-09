import type { Patient, PatientCreateInput, PatientUpdateInput, PatientListParams } from "@/domain/patient/patient.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
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
  create(input: PatientCreateInput, tenantId: string): Promise<Patient>;
  update(
    id: string,
    input: PatientUpdateInput,
    tenantId: string,
    expectedUpdatedAt?: string,
  ): Promise<Patient | null>;
  findByNameAndDOB(fullName: string, dateOfBirth: string, tenantId: string): Promise<Pick<Patient, "id" | "patient_code" | "full_name" | "date_of_birth">[]>;
  hasActiveAppointments(patientId: string, tenantId: string): Promise<boolean>;
  archive(id: string, tenantId: string, userId: string): Promise<Patient>;
  restore(id: string, tenantId: string): Promise<Patient>;
  deleteBulk(ids: string[], tenantId: string, userId: string): Promise<void>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
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
  async create(input, tenantId) {
    const payload = {
      tenant_id: tenantId,
      patient_code: null,
      full_name: input.full_name,
      date_of_birth: input.date_of_birth ?? null,
      gender: input.gender ?? null,
      blood_type: input.blood_type ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      insurance_provider: input.insurance_provider ?? null,
      status: input.status ?? "active",
    };

    const result = await platformRepository
      .from("patients", patientCtx(tenantId, "patients.create", "critical", [...PATIENT_WRITE_CAPS]))
      .insert(payload)
      .select(PATIENT_COLUMNS)
      .single();

    return assertOk(result) as Patient;
  },
  async update(id, input, tenantId, expectedUpdatedAt) {
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

    if (Object.keys(payload).length === 0) {
      return patientRepository.getById(id, tenantId);
    }

    let query = platformRepository
      .from("patients", patientCtx(tenantId, "patients.update", "critical", [...PATIENT_WRITE_CAPS]))
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (expectedUpdatedAt) {
      query = query.eq("updated_at", expectedUpdatedAt);
    }

    const { data, error } = await query.select(PATIENT_COLUMNS).maybeSingle();
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update patient", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? null) as Patient | null;
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
  async archive(id, tenantId, userId) {
    const result = await platformRepository
      .from("patients", patientCtx(tenantId, "patients.archive", "critical", [...PATIENT_WRITE_CAPS]))
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(PATIENT_COLUMNS)
      .single();

    return assertOk(result) as Patient;
  },
  async restore(id, tenantId) {
    const result = await platformRepository
      .from("patients", patientCtx(tenantId, "patients.restore", "critical", [...PATIENT_WRITE_CAPS]))
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(PATIENT_COLUMNS)
      .single();

    return assertOk(result) as Patient;
  },
  async deleteBulk(ids, tenantId, userId) {
    if (ids.length === 0) return;
    const { error } = await platformRepository
      .from("patients", patientCtx(tenantId, "patients.deleteBulk", "critical", [...PATIENT_WRITE_CAPS]))
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .in("id", ids)
      .eq("tenant_id", tenantId);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to delete patients", {
        code: error.code,
        details: error,
      });
    }
  },
  describe() {
    return {
      certified: false,
      tenantBound: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: ["patients.record.manage", "patients.record.view"],
    };
  },
};
