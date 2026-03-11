-- Aggregation and scheduling performance indexes
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status_date
  ON public.invoices (tenant_id, status, invoice_date);

CREATE INDEX IF NOT EXISTS idx_appointments_tenant_status_date
  ON public.appointments (tenant_id, status, appointment_date);

CREATE INDEX IF NOT EXISTS idx_patients_tenant_created_at
  ON public.patients (tenant_id, created_at);

-- Prevent double-booking the same doctor at the exact same time (non-cancelled)
CREATE UNIQUE INDEX IF NOT EXISTS ux_appointments_doctor_time
  ON public.appointments (tenant_id, doctor_id, appointment_date)
  WHERE status <> 'cancelled';
