-- Production hardening (phase 1):
-- 1) Tighten PHI access (patients + patient documents)
-- 2) Enforce tenant-scoped storage object policies for patient documents
-- 3) Ensure every tenant always has a subscription row
-- 4) Add reminder delivery dedupe log + secure scheduling helper

-- -------------------------------------------------------------------
-- Patients RLS hardening
-- -------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant users can view patients" ON public.patients;
DROP POLICY IF EXISTS "Tenant users can insert patients" ON public.patients;
DROP POLICY IF EXISTS "Tenant users can update patients" ON public.patients;

CREATE POLICY "Authorized users can view patients"
ON public.patients
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
    OR public.has_role(auth.uid(), 'accountant'::app_role)
  )
);

CREATE POLICY "Authorized users can insert patients"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);

CREATE POLICY "Authorized users can update patients"
ON public.patients
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);

-- -------------------------------------------------------------------
-- Patient documents table RLS hardening
-- -------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant users can view patient documents" ON public.patient_documents;

CREATE POLICY "Clinical staff can view patient documents"
ON public.patient_documents
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
  )
);

-- -------------------------------------------------------------------
-- Patient documents storage RLS hardening
-- -------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant users can read patient documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can upload patient documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete patient documents from storage" ON storage.objects;

CREATE POLICY "Clinical staff can read tenant patient documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'patient-documents'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
  )
);

CREATE POLICY "Clinical staff can upload tenant patient documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'patient-documents'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
  )
);

CREATE POLICY "Clinic admins can delete tenant patient documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'patient-documents'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
);

-- -------------------------------------------------------------------
-- Subscription bootstrap guarantee for new tenants
-- -------------------------------------------------------------------
DROP POLICY IF EXISTS "Clinic admins can view own subscription" ON public.subscriptions;

CREATE POLICY "Tenant users can view own subscription"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.create_default_subscription_for_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.subscriptions (
    tenant_id,
    plan,
    status,
    amount,
    currency,
    billing_cycle,
    started_at
  )
  VALUES (
    NEW.id,
    'free',
    'active',
    0,
    'EGP',
    'monthly',
    now()
  )
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_tenant_created_create_subscription ON public.tenants;
CREATE TRIGGER on_tenant_created_create_subscription
AFTER INSERT ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.create_default_subscription_for_tenant();

-- Backfill again for safety
INSERT INTO public.subscriptions (tenant_id, plan, status, amount, currency, billing_cycle, started_at)
SELECT id, 'free', 'active', 0, 'EGP', 'monthly', now()
FROM public.tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- -------------------------------------------------------------------
-- Reminder dedupe log
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  notified_user_id uuid NULL,
  patient_email text NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_reminder_log_target_ck
    CHECK (notified_user_id IS NOT NULL OR patient_email IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_appointment_reminder_log_in_app
ON public.appointment_reminder_log (appointment_id, notified_user_id, channel)
WHERE channel = 'in_app' AND notified_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_appointment_reminder_log_email
ON public.appointment_reminder_log (appointment_id, lower(patient_email), channel)
WHERE channel = 'email' AND patient_email IS NOT NULL;

ALTER TABLE public.appointment_reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct access to appointment_reminder_log" ON public.appointment_reminder_log;
CREATE POLICY "No direct access to appointment_reminder_log"
ON public.appointment_reminder_log
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- -------------------------------------------------------------------
-- Safe scheduling helper for reminder job (expects explicit secret)
-- -------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.schedule_appointment_reminders(
  _schedule text DEFAULT '*/30 * * * *',
  _function_url text DEFAULT NULL,
  _cron_secret text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _job_id bigint;
  _headers jsonb;
BEGIN
  IF _function_url IS NULL OR length(trim(_function_url)) = 0 THEN
    RAISE EXCEPTION 'Missing _function_url';
  END IF;

  IF _cron_secret IS NULL OR length(trim(_cron_secret)) < 16 THEN
    RAISE EXCEPTION 'Missing or weak _cron_secret';
  END IF;

  SELECT jobid INTO _job_id
  FROM cron.job
  WHERE jobname = 'appointment-reminders-job'
  LIMIT 1;

  IF _job_id IS NOT NULL THEN
    PERFORM cron.unschedule(_job_id);
  END IF;

  _headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-cron-secret', _cron_secret
  );

  PERFORM cron.schedule(
    'appointment-reminders-job',
    _schedule,
    format(
      'SELECT net.http_post(url := %L, headers := %L::jsonb);',
      _function_url,
      _headers::text
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_appointment_reminders(text, text, text) FROM anon, authenticated;

DO $$
DECLARE
  _secret text := current_setting('app.settings.reminder_cron_secret', true);
BEGIN
  IF _secret IS NOT NULL AND length(trim(_secret)) >= 16 THEN
    PERFORM public.schedule_appointment_reminders(
      '*/30 * * * *',
      'https://sspayyqutfdjusqcaqwy.supabase.co/functions/v1/appointment-reminders',
      _secret
    );
  END IF;
END;
$$;
