import type {
  Appointment,
  AppointmentCreateInput,
  AppointmentUpdateInput,
  AppointmentListParams,
  AppointmentWithDoctor,
  AppointmentWithPatientDoctor,
} from "@/domain/appointment/appointment.types";
import type { PagedResult } from "@/domain/shared/pagination.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const APPOINTMENT_COLUMNS =
  "id, tenant_id, patient_id, doctor_id, appointment_date, duration_minutes, type, status, notes, created_at, updated_at";
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

export interface AppointmentRepository {
  listPaged(params: AppointmentListParams, tenantId: string): Promise<PagedResult<Appointment>>;
  listPagedWithRelations(params: AppointmentListParams, tenantId: string): Promise<PagedResult<AppointmentWithPatientDoctor>>;
  listByDateRange(start: string, end: string, tenantId: string): Promise<AppointmentWithPatientDoctor[]>;
  listByPatient(patientId: string, tenantId: string): Promise<AppointmentWithDoctor[]>;
  countByStatus(tenantId: string): Promise<Record<string, number>>;
  getById(id: string, tenantId: string): Promise<Appointment>;
  hasConflict(doctorId: string, appointmentDate: string, tenantId: string, excludeId?: string): Promise<boolean>;
  create(input: AppointmentCreateInput, tenantId: string): Promise<Appointment>;
  update(id: string, input: AppointmentUpdateInput, tenantId: string): Promise<Appointment>;
}

export const appointmentRepository: AppointmentRepository = {
  async listPaged(params, tenantId) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const searchTerm = params.search?.trim() ?? "";

    let query = supabase
      .from("appointments")
      .select(APPOINTMENT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

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

    let query = supabase
      .from("appointments")
      .select(APPOINTMENT_WITH_PATIENT_DOCTOR_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId);

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
  async listByDateRange(start, end, tenantId) {
    const { data, error } = await supabase
      .from("appointments")
      .select(APPOINTMENT_WITH_PATIENT_DOCTOR_COLUMNS)
      .eq("tenant_id", tenantId)
      .gte("appointment_date", start)
      .lte("appointment_date", end)
      .order("appointment_date", { ascending: true });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load appointments", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AppointmentWithPatientDoctor[];
  },
  async listByPatient(patientId, tenantId) {
    const { data, error } = await supabase
      .from("appointments")
      .select(APPOINTMENT_WITH_DOCTOR_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("patient_id", patientId)
      .order("appointment_date", { ascending: false });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient appointments", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AppointmentWithDoctor[];
  },
  async countByStatus(tenantId) {
    const statuses = ["scheduled", "in_progress", "completed", "cancelled"] as const;
    const results = await Promise.all(
      statuses.map(async (status) => {
        const { count, error } = await supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
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
    const result = await supabase
      .from("appointments")
      .select(APPOINTMENT_COLUMNS)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single();

    return assertOk(result) as Appointment;
  },
  async hasConflict(doctorId, appointmentDate, tenantId, excludeId) {
    let query = supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
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

    const result = await supabase
      .from("appointments")
      .insert(payload as any)
      .select(APPOINTMENT_COLUMNS)
      .single();

    return assertOk(result) as Appointment;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};

    if (input.patient_id !== undefined) payload.patient_id = input.patient_id;
    if (input.doctor_id !== undefined) payload.doctor_id = input.doctor_id;
    if (input.appointment_date !== undefined) payload.appointment_date = input.appointment_date;
    if (input.duration_minutes !== undefined) payload.duration_minutes = input.duration_minutes;
    if (input.type !== undefined) payload.type = input.type;
    if (input.status !== undefined) payload.status = input.status;
    if (input.notes !== undefined) payload.notes = input.notes;

    if (Object.keys(payload).length === 0) {
      const result = await supabase
        .from("appointments")
        .select(APPOINTMENT_COLUMNS)
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();
      return assertOk(result) as Appointment;
    }

    const result = await supabase
      .from("appointments")
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(APPOINTMENT_COLUMNS)
      .single();

    return assertOk(result) as Appointment;
  },
};
