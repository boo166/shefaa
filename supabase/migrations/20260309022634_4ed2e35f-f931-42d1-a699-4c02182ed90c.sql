
-- Fix 1: Replace handle_new_user to hard-code default role instead of trusting client metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, tenant_id, full_name)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'tenant_id')::UUID, (SELECT id FROM public.tenants LIMIT 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  -- Always assign safe default role; admins must explicitly elevate via RPC
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    'doctor'::app_role
  );

  RETURN NEW;
END;
$function$;

-- Fix 2: Replace cross-tenant admin policy on user_roles with tenant-scoped version
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles in own tenant" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    AND user_id IN (
      SELECT p.user_id FROM public.profiles p
      WHERE p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    AND user_id IN (
      SELECT p.user_id FROM public.profiles p
      WHERE p.tenant_id = public.get_user_tenant_id(auth.uid())
    )
  );
