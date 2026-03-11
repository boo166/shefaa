-- Calendar queries benefit from a composite tenant/date index
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date
  ON public.appointments (tenant_id, appointment_date);
