-- Align client-side job enqueue RLS with the hardened jobs ownership contract.
-- Tenant users may enqueue jobs only for their own tenant and actor id.
-- Super admins may enqueue tenant-scoped operational jobs while explicitly stamping
-- initiated_as = 'super_admin'.

DROP POLICY IF EXISTS "Tenant users can enqueue jobs" ON public.jobs;

CREATE POLICY "Tenant users can enqueue owned jobs"
ON public.jobs
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND initiated_by = auth.uid()
  AND initiated_as = 'tenant_user'
);

DROP POLICY IF EXISTS "Super admins can enqueue tenant jobs" ON public.jobs;

CREATE POLICY "Super admins can enqueue tenant jobs"
ON public.jobs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin(auth.uid())
  AND initiated_by = auth.uid()
  AND initiated_as = 'super_admin'
);
