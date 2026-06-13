import type {
  Appointment,
  AppointmentCreateInput,
  AppointmentUpdateInput,
  AppointmentListParams,
  AppointmentWithDoctor,
  AppointmentWithPatientDoctor,
} from "@/domain/appointment/appointment.types";
import type { LimitOffsetParams, PagedResult } from "@/domain/shared/pagination.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const APPOINTMENT_COLUMNS =
  "id, tenant_id, patient_id, doctor_id, appointment_date, duration_minutes, type, status, notes, deleted_at, deleted_by, created_at, updated_at";
const APPOINTMENT_WITH_DOCTOR_COLUMNS = `${APPOINTMENT_COLUMNS}, doctors(full_name)`;
const APPOINTMENT_WITH_PATIENT_DOCTOR_COLUMNS = `${APPOINTMENT_COLUMNS}, patients(full_name), doctors(full_name)`;

const SEARCH_COLUMNS = ["notes", "type", "status"];
const RELATION_SEARCH_COLUMNS = ["patients.full_name", "doctors.full_name", "type", "status", "notes"];
const SORTABLE_COLUMNS = new Set([
  "appointment_date",
  "created_at",
  "updated_at",
  "status",
]);

function escapeSearchTerm(term: string) {
  return term.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
}

const APPT_READ_CAPS = [Capabilities.appointments.view, Capabilities.appointments.manage] as const;
const APPT_WRITE_CAPS = [Capabilities.appointments.manage] as const;

function appointmentCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
  requiredCapabilities?: string[],
): PlatformRepositoryContext {
  return { action, classification, tenantScoped: true, tenantId, requiredCapabilities };
}

export interface AppointmentRepository {
  listPaged(params: AppointmentListParams, tenantId: string): Promise<PagedResult<Appointment>>;
  listPagedWithRelations(params: AppointmentListParams, tenantId: string): Promise<PagedResult<AppointmentWithPatientDoctor>>;
  listByDateRange(
    start: string,
    end: string,
    tenantId: string,
    params?: LimitOffsetParams,
  ): Promise<AppointmentWithPatientDoctor[]>;
  listByPatient(patientId: string, tenantId: string, params?: LimitOffsetParams): Promise<AppointmentWithDoctor[]>;
  countByStatus(tenantId: string): Promise<Record<string, number>>;
  getById(id: string, tenantId: string): Promise<Appointment>;
  hasConflict(doctorId: string, appointmentDate: string, tenantId: string, excludeId?: string): Promise<boolean>;
  create(input: AppointmentCreateInput, tenantId: string): Promise<Appointment>;
  update(id: string, input: AppointmentUpdateInput, tenantId: string, expectedUpdatedAt?: string): Promise<Appointment | null>;
  archive(id: string, tenantId: string, userId: string): Promise<Appointment>;
  restore(id: string, tenantId: string): Promise<Appointment>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

export const appointmentRepository: AppointmentRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.listPaged", "readonly", [...APPT_READ_CAPS]))
      .select(APPOINTMENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.doctor_id === "string" && filters.doctor_id.length > 0) {
      query = query.eq("doctor_id", filters.doctor_id);
    }
    if (typeof filters.patient_id === "string" && filters.patient_id.length > 0) {
      query = query.eq("patient_id", filters.patient_id);
    }
    if (typeof filters.date_from === "string" && filters.date_from.length > 0) {
      query = query.gte("appointment_date", filters.date_from);
    }
    if (typeof filters.date_to === "string" && filters.date_to.length > 0) {
      query = query.lte("appointment_date", filters.date_to);
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
      : "appointment_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load appointments", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as Appointment[], count: count ?? 0 };
  },
  async listPagedWithRelations(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.listPagedWithRelations", "readonly", [...APPT_READ_CAPS]))
      .select(APPOINTMENT_WITH_PATIENT_DOCTOR_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null);

    const filters = params.filters ?? {};
    if (typeof filters.status === "string" && filters.status.length > 0) {
      query = query.eq("status", filters.status);
    }
    if (typeof filters.doctor_id === "string" && filters.doctor_id.length > 0) {
      query = query.eq("doctor_id", filters.doctor_id);
    }
    if (typeof filters.patient_id === "string" && filters.patient_id.length > 0) {
      query = query.eq("patient_id", filters.patient_id);
    }
    if (typeof filters.date_from === "string" && filters.date_from.length > 0) {
      query = query.gte("appointment_date", filters.date_from);
    }
    if (typeof filters.date_to === "string" && filters.date_to.length > 0) {
      query = query.lte("appointment_date", filters.date_to);
    }

    if (searchTerm) {
      const escaped = escapeSearchTerm(searchTerm);
      const orFilter = RELATION_SEARCH_COLUMNS
        .map((col) => `${col}.ilike.%${escaped}%`)
        .join(",");
      query = query.or(orFilter);
    }

    const sortColumn = params.sort?.column && SORTABLE_COLUMNS.has(params.sort.column)
      ? params.sort.column
      : "appointment_date";
    const sortAscending = params.sort?.ascending ?? false;

    query = query.order(sortColumn, { ascending: sortAscending }).range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load appointments", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as AppointmentWithPatientDoctor[], count: count ?? 0 };
  },
  async listByDateRange(start, end, tenantId, params) {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const { data, error } = await platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.listByDateRange", "readonly", [...APPT_READ_CAPS]))
      .select(APPOINTMENT_WITH_PATIENT_DOCTOR_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .gte("appointment_date", start)
      .lte("appointment_date", end)
      .order("appointment_date", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load appointments", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AppointmentWithPatientDoctor[];
  },
  async listByPatient(patientId, tenantId, params) {
    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;
    const { data, error } = await platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.listByPatient", "readonly", [...APPT_READ_CAPS]))
      .select(APPOINTMENT_WITH_DOCTOR_COLUMNS)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("patient_id", patientId)
      .order("appointment_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient appointments", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AppointmentWithDoctor[];
  },
  async countByStatus(tenantId) {
    const statuses = ["scheduled", "in_progress", "completed", "cancelled", "no_show"] as const;
    const results = await Promise.all(
      statuses.map(async (status) => {
        const { count, error } = await platformRepository
          .from("appointments", appointmentCtx(tenantId, `appointments.countByStatus.${status}`, "readonly", [...APPT_READ_CAPS]))
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .is("deleted_at", null)
          .eq("status", status);
        if (error) {
          throw new ServiceError(error.message ?? "Failed to load appointment counts", {
            code: error.code,
            details: error,
          });
        }
        return [status, count ?? 0] as const;
      }),
    );

    return results.reduce<Record<string, number>>((acc, [status, count]) => {
      acc[status] = count;
      return acc;
    }, {});
  },
  async getById(id, tenantId) {
    const result = await platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.getById", "readonly", [...APPT_READ_CAPS]))
      .select(APPOINTMENT_COLUMNS)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .single();

    return assertOk(result) as Appointment;
  },
  async hasConflict(doctorId, appointmentDate, tenantId, excludeId) {
    let query = platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.hasConflict", "readonly", [...APPT_READ_CAPS]))
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .eq("doctor_id", doctorId)
      .eq("appointment_date", appointmentDate)
      .neq("status", "cancelled");

    if (excludeId) {
      query = query.neq("id", excludeId);
    }

    const { count, error } = await query;
    if (error) {
      throw new ServiceError(error.message ?? "Failed to check appointment conflicts", {
        code: error.code,
        details: error,
      });
    }

    return (count ?? 0) > 0;
  },
  async create(input, tenantId) {
    const payload: Record<string, unknown> = {
      tenant_id: tenantId,
      patient_id: input.patient_id,
      doctor_id: input.doctor_id,
      appointment_date: input.appointment_date,
      type: input.type,
    };

    if (input.duration_minutes !== undefined) payload.duration_minutes = input.duration_minutes;
    if (input.status !== undefined) payload.status = input.status;
    if (input.notes !== undefined) payload.notes = input.notes;

    const result = await platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.create", "critical", [...APPT_WRITE_CAPS]))
      .insert(payload as any)
      .select(APPOINTMENT_COLUMNS)
      .single();

    return assertOk(result) as Appointment;
  },
  async update(id, input, tenantId, expectedUpdatedAt) {
    const payload: Record<string, unknown> = {};

    if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
    if (input.doctor_id !== undefined) payload.doctor_id = input.doctor_id;
    if (input.appointment_date !== undefined) payload.appointment_date = input.appointment_date;
    if (input.duration_minutes !== undefined) payload.duration_minutes = input.duration_minutes;
    if (input.type !== undefined) payload.type = input.type;
    if (input.status !== undefined) payload.status = input.status;
    if (input.notes !== undefined) payload.notes = input.notes;

    if (Object.keys(payload).length === 0) {
      const result = await platformRepository
        .from("appointments", appointmentCtx(tenantId, "appointments.getForUpdate", "readonly", [...APPT_READ_CAPS]))
        .select(APPOINTMENT_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as Appointment;
    }

    let query = platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.update", "critical", [...APPT_WRITE_CAPS]))
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (expectedUpdatedAt) {
      query = query.eq("updated_at", expectedUpdatedAt);
    }
    const { data, error } = await query.select(APPOINTMENT_COLUMNS).maybeSingle();
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update appointment", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? null) as Appointment | null;
  },
  async archive(id, tenantId, userId) {
    const result = await platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.archive", "critical", [...APPT_WRITE_CAPS]))
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(APPOINTMENT_COLUMNS)
      .single();

    return assertOk(result) as Appointment;
  },
  async restore(id, tenantId) {
    const result = await platformRepository
      .from("appointments", appointmentCtx(tenantId, "appointments.restore", "critical", [...APPT_WRITE_CAPS]))
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(APPOINTMENT_COLUMNS)
      .single();

    return assertOk(result) as Appointment;
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
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [...APPT_READ_CAPS],
    };
  },
};
