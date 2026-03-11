-- Invoice summary helper (tenant-scoped)
CREATE OR REPLACE FUNCTION public.get_invoice_summary()
RETURNS TABLE (
  total_count bigint,
  paid_count bigint,
  paid_amount numeric,
  pending_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    COUNT(*) FILTER (WHERE status = 'paid')::bigint AS paid_count,
    COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid_amount,
    COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'overdue')), 0) AS pending_amount
  FROM public.invoices
  WHERE tenant_id = public.get_user_tenant_id(auth.uid());
$$;
