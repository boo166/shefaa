
-- Create a secure RPC for admins to assign roles to users in their tenant
CREATE OR REPLACE FUNCTION public.admin_set_user_role(_target_user_id uuid, _role app_role)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  -- Verify caller is clinic_admin
  IF NOT public.has_role(auth.uid(), 'clinic_admin'::app_role) THEN
    RAISE EXCEPTION 'Only clinic admins can assign roles';
  END IF;

  -- Verify target user is in same tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _target_user_id
      AND tenant_id = public.get_user_tenant_id(auth.uid())
  ) THEN
    RAISE EXCEPTION 'User not in your tenant';
  END IF;

  -- Update the role
  UPDATE public.user_roles SET role = _role WHERE user_id = _target_user_id;
END;
$function$;
