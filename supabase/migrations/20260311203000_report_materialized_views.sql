-- Materialized views for report aggregates

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_report_overview AS
SELECT
  t.id AS tenant_id,
  COALESCE(inv.total_revenue, 0) AS total_revenue,
  COALESCE(p.total_patients, 0)::bigint AS total_patients,
  COALESCE(a.total_appointments, 0)::bigint AS total_appointments,
  COALESCE(d.avg_doctor_rating, 0) AS avg_doctor_rating
FROM public.tenants t
LEFT JOIN (
  SELECT tenant_id, SUM(amount) FILTER (WHERE status = 'paid') AS total_revenue
  FROM public.invoices
  GROUP BY tenant_id
) inv ON inv.tenant_id = t.id
LEFT JOIN (
  SELECT tenant_id, COUNT(*) AS total_patients
  FROM public.patients
  GROUP BY tenant_id
) p ON p.tenant_id = t.id
LEFT JOIN (
  SELECT tenant_id, COUNT(*) AS total_appointments
  FROM public.appointments
  GROUP BY tenant_id
) a ON a.tenant_id = t.id
LEFT JOIN (
  SELECT tenant_id, AVG(COALESCE(rating, 0)) AS avg_doctor_rating
  FROM public.doctors
  GROUP BY tenant_id
) d ON d.tenant_id = t.id
WITH DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_report_revenue_by_month AS
SELECT
  tenant_id,
  date_trunc('month', invoice_date)::date AS month_start,
  COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS revenue,
  COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'overdue')), 0) AS expenses
FROM public.invoices
GROUP BY tenant_id, month_start
WITH DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_report_patient_growth AS
WITH monthly AS (
  SELECT
    tenant_id,
    date_trunc('month', created_at)::date AS month_start,
    COUNT(*)::bigint AS new_patients
  FROM public.patients
  GROUP BY tenant_id, month_start
)
SELECT
  tenant_id,
  month_start,
  SUM(new_patients) OVER (PARTITION BY tenant_id ORDER BY month_start) AS total_patients
FROM monthly
WITH DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_report_appointment_types AS
SELECT tenant_id, type, COUNT(*)::bigint AS count
FROM public.appointments
GROUP BY tenant_id, type
WITH DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_report_appointment_statuses AS
SELECT tenant_id, status, COUNT(*)::bigint AS count
FROM public.appointments
GROUP BY tenant_id, status
WITH DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_report_revenue_by_service AS
SELECT
  tenant_id,
  COALESCE(NULLIF(service, ''), 'Other') AS service,
  COALESCE(SUM(amount), 0) AS revenue
FROM public.invoices
WHERE status = 'paid'
GROUP BY tenant_id, service
WITH DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_report_doctor_performance AS
SELECT
  d.tenant_id,
  d.id AS doctor_id,
  d.full_name AS doctor_name,
  COUNT(a.id)::bigint AS appointments,
  COUNT(a.id) FILTER (WHERE a.status = 'completed')::bigint AS completed,
  COALESCE(d.rating, 0) AS rating
FROM public.doctors d
LEFT JOIN public.appointments a
  ON a.doctor_id = d.id
 AND a.tenant_id = d.tenant_id
GROUP BY d.tenant_id, d.id, d.full_name, d.rating
WITH DATA;

CREATE INDEX IF NOT EXISTS idx_mv_report_overview_tenant
  ON public.mv_report_overview (tenant_id);

CREATE INDEX IF NOT EXISTS idx_mv_report_revenue_by_month_tenant_month
  ON public.mv_report_revenue_by_month (tenant_id, month_start);

CREATE INDEX IF NOT EXISTS idx_mv_report_patient_growth_tenant_month
  ON public.mv_report_patient_growth (tenant_id, month_start);

CREATE INDEX IF NOT EXISTS idx_mv_report_appointment_types_tenant
  ON public.mv_report_appointment_types (tenant_id);

CREATE INDEX IF NOT EXISTS idx_mv_report_appointment_statuses_tenant
  ON public.mv_report_appointment_statuses (tenant_id);

CREATE INDEX IF NOT EXISTS idx_mv_report_revenue_by_service_tenant
  ON public.mv_report_revenue_by_service (tenant_id);

CREATE INDEX IF NOT EXISTS idx_mv_report_doctor_performance_tenant
  ON public.mv_report_doctor_performance (tenant_id);

-- Refresh helper
CREATE OR REPLACE FUNCTION public.refresh_report_materialized_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_report_overview;
  REFRESH MATERIALIZED VIEW public.mv_report_revenue_by_month;
  REFRESH MATERIALIZED VIEW public.mv_report_patient_growth;
  REFRESH MATERIALIZED VIEW public.mv_report_appointment_types;
  REFRESH MATERIALIZED VIEW public.mv_report_appointment_statuses;
  REFRESH MATERIALIZED VIEW public.mv_report_revenue_by_service;
  REFRESH MATERIALIZED VIEW public.mv_report_doctor_performance;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_report_materialized_views() FROM anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  _schedule text := current_setting('app.settings.report_refresh_schedule', true);
  _job_id bigint;
BEGIN
  IF _schedule IS NOT NULL AND length(trim(_schedule)) > 0 THEN
    SELECT jobid INTO _job_id
    FROM cron.job
    WHERE jobname = 'report-refresh-job'
    LIMIT 1;

    IF _job_id IS NOT NULL THEN
      PERFORM cron.unschedule(_job_id);
    END IF;

    PERFORM cron.schedule(
      'report-refresh-job',
      _schedule,
      'SELECT public.refresh_report_materialized_views();'
    );
  END IF;
END;
$$;

-- Update report RPCs to read from materialized views
CREATE OR REPLACE FUNCTION public.get_report_overview()
RETURNS TABLE (
  total_revenue numeric,
  total_patients bigint,
  total_appointments bigint,
  avg_doctor_rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT total_revenue, total_patients, total_appointments, avg_doctor_rating
  FROM public.mv_report_overview
  WHERE tenant_id = public.get_user_tenant_id(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_report_revenue_by_month(_months integer DEFAULT 6)
RETURNS TABLE (
  month_start date,
  revenue numeric,
  expenses numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT month_start, revenue, expenses
  FROM public.mv_report_revenue_by_month
  WHERE tenant_id = public.get_user_tenant_id(auth.uid())
  ORDER BY month_start DESC
  LIMIT COALESCE(_months, 6);
$$;

CREATE OR REPLACE FUNCTION public.get_report_patient_growth(_months integer DEFAULT 6)
RETURNS TABLE (
  month_start date,
  total_patients bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT month_start, total_patients
  FROM public.mv_report_patient_growth
  WHERE tenant_id = public.get_user_tenant_id(auth.uid())
  ORDER BY month_start DESC
  LIMIT COALESCE(_months, 6);
$$;

CREATE OR REPLACE FUNCTION public.get_report_appointment_types()
RETURNS TABLE (
  type text,
  count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT type, count
  FROM public.mv_report_appointment_types
  WHERE tenant_id = public.get_user_tenant_id(auth.uid())
  ORDER BY count DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_report_appointment_statuses()
RETURNS TABLE (
  status text,
  count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status, count
  FROM public.mv_report_appointment_statuses
  WHERE tenant_id = public.get_user_tenant_id(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_report_revenue_by_service(_limit integer DEFAULT 6)
RETURNS TABLE (
  service text,
  revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT service, revenue
  FROM public.mv_report_revenue_by_service
  WHERE tenant_id = public.get_user_tenant_id(auth.uid())
  ORDER BY revenue DESC
  LIMIT COALESCE(_limit, 6);
$$;

CREATE OR REPLACE FUNCTION public.get_report_doctor_performance()
RETURNS TABLE (
  doctor_id uuid,
  doctor_name text,
  appointments bigint,
  completed bigint,
  rating numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT doctor_id, doctor_name, appointments, completed, rating
  FROM public.mv_report_doctor_performance
  WHERE tenant_id = public.get_user_tenant_id(auth.uid())
  ORDER BY appointments DESC;
$$;
