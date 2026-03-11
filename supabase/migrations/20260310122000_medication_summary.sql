-- Medication summary helper (tenant-scoped)
CREATE OR REPLACE FUNCTION public.get_medication_summary()
RETURNS TABLE (
  total_count bigint,
  low_stock_count bigint,
  inventory_value numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    COUNT(*) FILTER (WHERE status = 'low_stock')::bigint AS low_stock_count,
    COALESCE(SUM(price * stock), 0) AS inventory_value
  FROM public.medications
  WHERE tenant_id = public.get_user_tenant_id(auth.uid());
$$;
