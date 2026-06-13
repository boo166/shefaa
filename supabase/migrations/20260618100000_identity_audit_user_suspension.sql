-- Identity audit trail, user suspension, and server-side identity events (Phase A/B).

-- ---------------------------------------------------------------------------
-- User account status (per-user suspension)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_account_status_ck'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_ck
      CHECK (account_status IN ('active', 'suspended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_account_status
  ON public.profiles (tenant_id, account_status);

-- ---------------------------------------------------------------------------
-- Identity audit RPC (metadata: ip, user_agent, actor_user_id, request_trace_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_identity_audit_event(
  _action text,
  _user_id uuid DEFAULT NULL,
  _tenant_id uuid DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL,
  _entity_type text DEFAULT 'identity',
  _entity_id uuid DEFAULT NULL,
  _details jsonb DEFAULT NULL,
  _request_id uuid DEFAULT NULL,
  _ip_address text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_subject uuid := COALESCE(_user_id, _actor_user_id, auth.uid());
  v_actor uuid := COALESCE(_actor_user_id, auth.uid(), v_subject);
  v_tenant uuid := _tenant_id;
  v_action_type text := lower(regexp_replace(trim(_action), '[^a-zA-Z0-9]+', '_', 'g'));
  v_payload jsonb;
BEGIN
  IF v_subject IS NULL THEN
    v_subject := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  IF v_tenant IS NULL AND v_subject IS NOT NULL AND v_subject <> '00000000-0000-0000-0000-000000000001'::uuid THEN
    SELECT p.tenant_id INTO v_tenant
    FROM public.profiles p
    WHERE p.user_id = v_subject
    LIMIT 1;
  END IF;

  v_payload := COALESCE(_details, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'actor_user_id', v_actor,
    'request_trace_id', _request_id,
    'user_agent', NULLIF(trim(_user_agent), '')
  ));

  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    actor_id,
    action,
    action_type,
    request_id,
    entity_type,
    resource_type,
    entity_id,
    resource_id,
    details,
    metadata,
    ip_address,
    is_global
  )
  VALUES (
    v_tenant,
    v_subject,
    COALESCE(v_actor, v_subject),
    upper(trim(_action)),
    v_action_type,
    _request_id,
    COALESCE(NULLIF(trim(_entity_type), ''), 'identity'),
    COALESCE(NULLIF(trim(_entity_type), ''), 'identity'),
    _entity_id,
    _entity_id,
    v_payload,
    v_payload,
    NULLIF(trim(_ip_address), ''),
    v_tenant IS NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.log_identity_audit_event(text, uuid, uuid, uuid, text, uuid, jsonb, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_identity_audit_event(text, uuid, uuid, uuid, text, uuid, jsonb, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_identity_audit_event(text, uuid, uuid, uuid, text, uuid, jsonb, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- get_user_tenant_id: block suspended staff profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id
  FROM (
    SELECT p.tenant_id, 1 AS priority
    FROM public.profiles p
    INNER JOIN public.tenants t ON t.id = p.tenant_id
    WHERE p.user_id = _user_id
      AND t.status = 'active'
      AND p.account_status = 'active'

    UNION ALL

    SELECT pa.tenant_id, 2 AS priority
    FROM public.patient_accounts pa
    INNER JOIN public.tenants t ON t.id = pa.tenant_id
    WHERE pa.auth_user_id = _user_id
      AND pa.status = 'active'
      AND t.status = 'active'
  ) resolved
  ORDER BY priority
  LIMIT 1
$$;

-- ---------------------------------------------------------------------------
-- MFA recovery: audit RECOVERY_CODE_USED
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_mfa_recovery_code(p_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  h text;
  found_id uuid;
  v_tenant uuid;
BEGIN
  IF uid IS NULL OR p_code IS NULL OR length(trim(p_code)) < 8 THEN
    RETURN false;
  END IF;
  h := encode(digest(convert_to(lower(trim(p_code)), 'UTF8'), 'sha256'), 'hex');
  SELECT id INTO found_id
  FROM public.mfa_recovery_code_hashes
  WHERE user_id = uid AND code_hash = h AND used_at IS NULL
  LIMIT 1;
  IF found_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.mfa_recovery_code_hashes
  SET used_at = now()
  WHERE id = found_id;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE user_id = uid LIMIT 1;

  PERFORM public.log_identity_audit_event(
    'RECOVERY_CODE_USED',
    uid,
    v_tenant,
    uid,
    'auth_mfa_recovery',
    found_id,
    jsonb_build_object('method', 'recovery_code'),
    NULL,
    NULL,
    NULL
  );

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Staff invite accepted (server-side on signup)
-- ---------------------------------------------------------------------------
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
  _patient_id uuid;
  _is_invite boolean := false;
BEGIN
  IF NEW.raw_user_meta_data->>'portal' = 'true' THEN
    BEGIN
      _tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
      _patient_id := (NEW.raw_user_meta_data->>'patient_id')::uuid;
    EXCEPTION WHEN others THEN
      _tenant_id := NULL;
      _patient_id := NULL;
    END;

    IF _tenant_id IS NULL OR _patient_id IS NULL THEN
      RAISE EXCEPTION 'Invalid portal signup metadata';
    END IF;

    INSERT INTO public.patient_accounts (tenant_id, patient_id, auth_user_id, status, invited_at, activated_at)
    VALUES (_tenant_id, _patient_id, NEW.id, 'active', now(), now())
    ON CONFLICT (patient_id) DO UPDATE
      SET auth_user_id = EXCLUDED.auth_user_id,
          status = 'active',
          invited_at = COALESCE(public.patient_accounts.invited_at, now()),
          activated_at = now(),
          updated_at = now();

    UPDATE public.patients
    SET user_id = NEW.id
    WHERE id = _patient_id;

    RETURN NEW;
  END IF;

  IF NEW.raw_user_meta_data->>'tenant_id' IS NOT NULL THEN
    SELECT id, pending_owner_email INTO _tenant_id, _pending_email
    FROM public.tenants
    WHERE id = (NEW.raw_user_meta_data->>'tenant_id')::uuid;
  END IF;

  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'No valid tenant_id provided for new user';
  END IF;

  IF _pending_email IS NOT NULL AND lower(_pending_email) = lower(NEW.email) THEN
    _role := 'clinic_admin'::app_role;
    UPDATE public.tenants SET pending_owner_email = NULL WHERE id = _tenant_id;
  ELSE
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
    _is_invite := true;

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

  IF _is_invite THEN
    PERFORM public.log_identity_audit_event(
      'INVITE_ACCEPTED',
      NEW.id,
      _tenant_id,
      NEW.id,
      'user_invite',
      NEW.id,
      jsonb_build_object(
        'email', NEW.email,
        'role', _role::text
      ),
      NULL,
      NULL,
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Role changes audit
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_actor uuid := auth.uid();
  v_target uuid;
  v_old_role text;
  v_new_role text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_target := NEW.user_id;
    v_new_role := NEW.role::text;
    v_old_role := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_target := NEW.user_id;
    v_new_role := NEW.role::text;
    v_old_role := OLD.role::text;
    IF v_old_role = v_new_role THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_target := OLD.user_id;
    v_old_role := OLD.role::text;
    v_new_role := NULL;
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.profiles WHERE user_id = v_target LIMIT 1;

  PERFORM public.log_identity_audit_event(
    'ROLE_CHANGED',
    v_target,
    v_tenant,
    COALESCE(v_actor, v_target),
    'user_role',
    v_target,
    jsonb_build_object(
      'old_role', v_old_role,
      'new_role', v_new_role,
      'operation', TG_OP
    ),
    NULL,
    NULL,
    NULL
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_user_roles_change ON public.user_roles;
CREATE TRIGGER audit_user_roles_change
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_user_role_change();

-- ---------------------------------------------------------------------------
-- Suspend / reactivate user (clinic_admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clinic_suspend_user(
  p_target_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant uuid;
  v_target_tenant uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'clinic_admin'::app_role) THEN
    RAISE EXCEPTION 'clinic_admin required' USING ERRCODE = '42501';
  END IF;

  v_tenant := public.get_user_tenant_id(v_actor);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_target_tenant
  FROM public.profiles
  WHERE user_id = p_target_user_id;

  IF v_target_tenant IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id = v_actor THEN
    RAISE EXCEPTION 'cannot suspend yourself' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET account_status = 'suspended'
  WHERE user_id = p_target_user_id
    AND tenant_id = v_tenant;

  PERFORM public.log_identity_audit_event(
    'USER_SUSPENDED',
    p_target_user_id,
    v_tenant,
    v_actor,
    'user_profile',
    p_target_user_id,
    jsonb_build_object('reason', NULLIF(trim(p_reason), '')),
    NULL,
    NULL,
    NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.clinic_reactivate_user(
  p_target_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_tenant uuid;
  v_target_tenant uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_actor, 'clinic_admin'::app_role) THEN
    RAISE EXCEPTION 'clinic_admin required' USING ERRCODE = '42501';
  END IF;

  v_tenant := public.get_user_tenant_id(v_actor);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'tenant context required' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_target_tenant
  FROM public.profiles
  WHERE user_id = p_target_user_id;

  IF v_target_tenant IS DISTINCT FROM v_tenant THEN
    RAISE EXCEPTION 'tenant mismatch' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET account_status = 'active'
  WHERE user_id = p_target_user_id
    AND tenant_id = v_tenant;

  PERFORM public.log_identity_audit_event(
    'USER_REACTIVATED',
    p_target_user_id,
    v_tenant,
    v_actor,
    'user_profile',
    p_target_user_id,
    jsonb_build_object('reason', NULLIF(trim(p_reason), '')),
    NULL,
    NULL,
    NULL
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.clinic_suspend_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clinic_reactivate_user(uuid, text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_audit_logs_identity_actions
  ON public.audit_logs (tenant_id, action, created_at DESC)
  WHERE entity_type = 'identity' OR resource_type = 'identity';
