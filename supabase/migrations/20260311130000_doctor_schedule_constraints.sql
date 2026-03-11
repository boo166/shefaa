-- Allow multiple schedule slots per day and improve lookup performance
ALTER TABLE public.doctor_schedules
  DROP CONSTRAINT IF EXISTS doctor_schedules_doctor_id_day_of_week_key;

CREATE UNIQUE INDEX IF NOT EXISTS doctor_schedules_doctor_day_start_unique
  ON public.doctor_schedules (doctor_id, day_of_week, start_time);

CREATE INDEX IF NOT EXISTS idx_doctor_schedule_lookup
  ON public.doctor_schedules (tenant_id, doctor_id, day_of_week);
