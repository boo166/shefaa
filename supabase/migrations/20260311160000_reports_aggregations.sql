-- Report aggregation helpers (tenant-scoped)

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
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_revenue,
    COALESCE((SELECT COUNT(*) FROM public.patients WHERE tenant_id = public.get_user_tenant_id(auth.uid())), 0)::bigint AS total_patients,
    COALESCE((SELECT COUNT(*) FROM public.appointments WHERE tenant_id = public.get_user_tenant_id(auth.uid())), 0)::bigint AS total_appointments,
    COALESCE((SELECT AVG(COALESCE(rating, 0)) FROM public.doctors WHERE tenant_id = public.get_user_tenant_id(auth.uid())), 0) AS avg_doctor_rating
  FROM public.invoices
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
  WITH monthly AS (
    SELECT
      date_trunc('month', invoice_date)::date AS month_start,
      COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS revenue,
      COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'overdue')), 0) AS expenses
    FROM public.invoices
    WHERE tenant_id = public.get_user_tenant_id(auth.uid())
    GROUP BY 1
  ),
  limited AS (
    SELECT * FROM monthly ORDER BY month_start DESC LIMIT COALESCE(_months, 6)
  )
  SELECT month_start, revenue, expenses
  FROM limited
  ORDER BY month_start;
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
  WITH monthly AS (
    SELECT
      date_trunc('month', created_at)::date AS month_start,
      COUNT(*)::bigint AS new_patients
    FROM public.patients
    WHERE tenant_id = public.get_user_tenant_id(auth.uid())
    GROUP BY 1
  ),
  ordered AS (
    SELECT
      month_start,
      SUM(new_patients) OVER (ORDER BY month_start) AS total_patients
    FROM monthly
  ),
  limited AS (
    SELECT * FROM ordered ORDER BY month_start DESC LIMIT COALESCE(_months, 6)
  )
  SELECT month_start, total_patients
  FROM limited
  ORDER BY month_start;
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
  SELECT type, COUNT(*)::bigint AS count
  FROM public.appointments
  WHERE tenant_id = public.get_user_tenant_id(auth.uid())
  GROUP BY type
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
  SELECT status, COUNT(*)::bigint AS count
  FROM public.appointments
  WHERE tenant_id = public.get_user_tenant_id(auth.uid())
  GROUP BY status;
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
  SELECT
    COALESCE(NULLIF(service, ''), 'Other') AS service,
    COALESCE(SUM(amount), 0) AS revenue
  FROM public.invoices
  WHERE tenant_id = public.get_user_tenant_id(auth.uid())
    AND status = 'paid'
  GROUP BY 1
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
  SELECT
    d.id AS doctor_id,
    d.full_name AS doctor_name,
    COUNT(a.id)::bigint AS appointments,
    COUNT(a.id) FILTER (WHERE a.status = 'completed')::bigint AS completed,
    COALESCE(d.rating, 0) AS rating
  FROM public.doctors d
  LEFT JOIN public.appointments a
    ON a.doctor_id = d.id
   AND a.tenant_id = d.tenant_id
  WHERE d.tenant_id = public.get_user_tenant_id(auth.uid())
  GROUP BY d.id, d.full_name, d.rating
  ORDER BY appointments DESC;
$$;
