-- Mirror live state: user_invites table + invite_code-verified handle_new_user

-- Ensure user_invites table exists (idempotent)
CREATE TABLE IF NOT EXISTS public.user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'doctor'::public.app_role,
  invite_code uuid NOT NULL UNIQUE,
  invited_by_user_id uuid NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct access to invites" ON public.user_invites;
CREATE POLICY "No direct access to invites"
ON public.user_invites FOR ALL USING (false) WITH CHECK (false);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_invites_tenant_email_pending
ON public.user_invites (tenant_id, lower(email)) WHERE consumed_at IS NULL;

-- Rewrite handle_new_user to use invite_code verification (replaces invited_by_admin flag)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tenant_id uuid;
  _pending_email text;
  _role app_role;
  _invite_role app_role;
  _invite_code uuid;
BEGIN
  IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    SELECT id, pending_owner_email INTO _tenant_id, _pending_email
    FROM public.tenants
    WHERE id = (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  END IF;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'No valid tenant_id provided for new user';
  END IF;

  -- Founding owner claim
  IF _pending_email IS NOT NULL AND lower(_pending_email) = lower(NEW.email) THEN
    _role := 'clinic_admin'::app_role;
    UPDATE public.tenants SET pending_owner_email = NULL WHERE id = _tenant_id;
  ELSE
    -- Staff invite claim: require server-created invite_code
    BEGIN
      _invite_code := (NEW.raw_user_meta_data->>'invite_code')::uuid;
    EXCEPTION WHEN others THEN
      _invite_code := NULL;
    END;

    IF _invite_code IS NULL THEN
      RAISE EXCEPTION 'Not authorized to join this tenant';
    END IF;

    SELECT role INTO _invite_role
    FROM public.user_invites
    WHERE tenant_id = _tenant_id
      AND lower(email) = lower(NEW.email)
      AND invite_code = _invite_code
      AND consumed_at IS NULL
    LIMIT 1;

    IF _invite_role IS NULL THEN
      RAISE EXCEPTION 'Invalid or expired invite';
    END IF;

    _role := _invite_role;

    UPDATE public.user_invites
    SET consumed_at = now()
    WHERE tenant_id = _tenant_id
      AND lower(email) = lower(NEW.email)
      AND invite_code = _invite_code
      AND consumed_at IS NULL;
  END IF;

  INSERT INTO public.profiles (user_id, tenant_id, full_name)
  VALUES (
    NEW.id,
    _tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

-- Ensure trigger is attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Lock down legacy RPCs from client use
REVOKE ALL ON FUNCTION public.create_tenant_and_signup(text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.create_tenant_and_signup(text, text, text) FROM anon, authenticated;