-- Insurance summary helper (tenant-scoped)
CREATE OR REPLACE FUNCTION public.get_insurance_summary()
RETURNS TABLE (
  total_count bigint,
  pending_count bigint,
  approved_count bigint,
  rejected_count bigint,
  providers_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_count,
    COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending_count,
    COUNT(*) FILTER (WHERE status = 'approved')::bigint AS approved_count,
    COUNT(*) FILTER (WHERE status = 'rejected')::bigint AS rejected_count,
    COUNT(DISTINCT NULLIF(provider, ''))::bigint AS providers_count
  FROM public.insurance_claims
  WHERE tenant_id = public.get_user_tenant_id(auth.uid());
$$;
