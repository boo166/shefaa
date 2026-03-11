-- Audit triggers for critical domain actions

CREATE OR REPLACE FUNCTION public.audit_patients_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_fields text[];
  new_data jsonb;
  old_data jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      'patient_created',
      'patient',
      NEW.id,
      jsonb_build_object('fields', ARRAY['id'])
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    new_data := to_jsonb(NEW);
    old_data := to_jsonb(OLD);

    SELECT array_agg(key)
      INTO changed_fields
    FROM jsonb_each(new_data) AS e(key, value)
    WHERE (new_data->key) IS DISTINCT FROM (old_data->key)
      AND key NOT IN ('updated_at');

    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      'patient_updated',
      'patient',
      NEW.id,
      jsonb_build_object('fields', COALESCE(changed_fields, ARRAY[]::text[]))
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_appointments_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_fields text[];
  new_data jsonb;
  old_data jsonb;
  action_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      'appointment_created',
      'appointment',
      NEW.id,
      jsonb_build_object('fields', ARRAY['id'])
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    new_data := to_jsonb(NEW);
    old_data := to_jsonb(OLD);

    SELECT array_agg(key)
      INTO changed_fields
    FROM jsonb_each(new_data) AS e(key, value)
    WHERE (new_data->key) IS DISTINCT FROM (old_data->key)
      AND key NOT IN ('updated_at');

    action_name := CASE
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'appointment_status_changed'
      ELSE 'appointment_updated'
    END;

    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      action_name,
      'appointment',
      NEW.id,
      jsonb_build_object('fields', COALESCE(changed_fields, ARRAY[]::text[]))
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_invoices_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_fields text[];
  new_data jsonb;
  old_data jsonb;
  action_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      'invoice_created',
      'invoice',
      NEW.id,
      jsonb_build_object('fields', ARRAY['id'])
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    new_data := to_jsonb(NEW);
    old_data := to_jsonb(OLD);

    SELECT array_agg(key)
      INTO changed_fields
    FROM jsonb_each(new_data) AS e(key, value)
    WHERE (new_data->key) IS DISTINCT FROM (old_data->key)
      AND key NOT IN ('updated_at');

    action_name := CASE
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'invoice_status_changed'
      ELSE 'invoice_updated'
    END;

    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      action_name,
      'invoice',
      NEW.id,
      jsonb_build_object('fields', COALESCE(changed_fields, ARRAY[]::text[]))
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_patients_changes ON public.patients;
CREATE TRIGGER audit_patients_changes
AFTER INSERT OR UPDATE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.audit_patients_changes();

DROP TRIGGER IF EXISTS audit_appointments_changes ON public.appointments;
CREATE TRIGGER audit_appointments_changes
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.audit_appointments_changes();

DROP TRIGGER IF EXISTS audit_invoices_changes ON public.invoices;
CREATE TRIGGER audit_invoices_changes
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.audit_invoices_changes();
