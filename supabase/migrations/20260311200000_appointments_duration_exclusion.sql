-- Appointment duration + overlap prevention
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 30
  CHECK (duration_minutes > 0 AND duration_minutes <= 1440);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS appointment_range tstzrange;

CREATE OR REPLACE FUNCTION public.set_appointment_range()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.appointment_range := tstzrange(
    NEW.appointment_date,
    NEW.appointment_date + (NEW.duration_minutes * interval '1 minute'),
    '[)'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_range ON public.appointments;
CREATE TRIGGER set_appointment_range
BEFORE INSERT OR UPDATE OF appointment_date, duration_minutes
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.set_appointment_range();

UPDATE public.appointments
SET appointment_range = tstzrange(
  appointment_date,
  appointment_date + (duration_minutes * interval '1 minute'),
  '[)'
)
WHERE appointment_range IS NULL;

ALTER TABLE public.appointments
  ALTER COLUMN appointment_range SET NOT NULL;

-- Remove the old exact-time uniqueness if present (range constraint supersedes it)
DROP INDEX IF EXISTS ux_appointments_doctor_time;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_no_overlap;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    doctor_id WITH =,
    appointment_range WITH &&
  )
  WHERE (status <> 'cancelled');
