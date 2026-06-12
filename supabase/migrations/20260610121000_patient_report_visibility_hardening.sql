CREATE OR REPLACE FUNCTION public.get_report_overview(_tenant_id uuid DEFAULT NULL)
RETURNS TABLE (
  total_revenue numeric,
  total_patients bigint,
  total_appointments bigint,
  avg_doctor_rating numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_tenant_id uuid;
  v_tenant_id uuid;
BEGIN
  v_user_tenant_id := public.get_user_tenant_id(auth.uid());
  v_tenant_id := COALESCE(_tenant_id, v_user_tenant_id);

  IF v_user_tenant_id IS NULL OR v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Missing tenant context for report overview' USING ERRCODE = '42501';
  END IF;

  IF v_tenant_id <> v_user_tenant_id THEN
    RAISE EXCEPTION 'Tenant mismatch for report overview' USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_can_view_reports();

  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(ip.amount)
      FROM public.invoice_payments ip
      WHERE ip.tenant_id = v_tenant_id
    ), 0) AS total_revenue,
    COALESCE((
      SELECT COUNT(*)
      FROM public.patients p
      WHERE p.tenant_id = v_tenant_id
        AND p.deleted_at IS NULL
    ), 0)::bigint AS total_patients,
    COALESCE((
      SELECT COUNT(*)
      FROM public.appointments a
      WHERE a.tenant_id = v_tenant_id
    ), 0)::bigint AS total_appointments,
    COALESCE((
      SELECT AVG(COALESCE(d.rating, 0))
      FROM public.doctors d
      WHERE d.tenant_id = v_tenant_id
    ), 0) AS avg_doctor_rating;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_report_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_overview(uuid) TO authenticated;
