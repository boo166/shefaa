import type { DoctorSchedule, DoctorScheduleUpsertInput } from "@/domain/doctor/doctorSchedule.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const DOCTOR_SCHEDULE_COLUMNS =
  "id, tenant_id, doctor_id, day_of_week, start_time, end_time, is_active, created_at, updated_at";

export interface DoctorScheduleRepository {
  listByDoctor(doctorId: string, tenantId: string): Promise<DoctorSchedule[]>;
  upsertMany(doctorId: string, rows: DoctorScheduleUpsertInput[], tenantId: string): Promise<DoctorSchedule[]>;
}

export const doctorScheduleRepository: DoctorScheduleRepository = {
  async listByDoctor(doctorId, tenantId) {
    const { data, error } = await supabase
      .from("doctor_schedules")
      .select(DOCTOR_SCHEDULE_COLUMNS)
      .eq("doctor_id", doctorId)
      .eq("tenant_id", tenantId)
      .order("day_of_week", { ascending: true });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load doctor schedule", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as DoctorSchedule[];
  },
  async upsertMany(doctorId, rows, tenantId) {
    if (rows.length === 0) return [];

    const payload = rows.map((row) => ({
      doctor_id: doctorId,
      tenant_id: tenantId,
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      is_active: row.is_active,
    }));

    const result = await supabase
      .from("doctor_schedules")
      .upsert(payload, { onConflict: "doctor_id,day_of_week,start_time" })
      .select(DOCTOR_SCHEDULE_COLUMNS);

    const data = assertOk(result) as DoctorSchedule[] | null;
    return data ?? [];
  },
};
