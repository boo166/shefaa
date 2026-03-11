-- Audit triggers for additional clinical domains

CREATE OR REPLACE FUNCTION public.audit_patient_documents_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      'patient_document_uploaded',
      'patient_document',
      NEW.id,
      jsonb_build_object('fields', ARRAY['id'])
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit_event(
      OLD.tenant_id,
      auth.uid(),
      'patient_document_deleted',
      'patient_document',
      OLD.id,
      jsonb_build_object('fields', ARRAY['id'])
    );
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_prescriptions_changes()
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
      'prescription_created',
      'prescription',
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
      AND key NOT IN ('created_at');

    action_name := CASE
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'prescription_status_changed'
      ELSE 'prescription_updated'
    END;

    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      action_name,
      'prescription',
      NEW.id,
      jsonb_build_object('fields', COALESCE(changed_fields, ARRAY[]::text[]))
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_lab_orders_changes()
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
      'lab_order_created',
      'lab_order',
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
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'lab_order_status_changed'
      ELSE 'lab_order_updated'
    END;

    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      action_name,
      'lab_order',
      NEW.id,
      jsonb_build_object('fields', COALESCE(changed_fields, ARRAY[]::text[]))
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_insurance_claims_changes()
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
      'insurance_claim_created',
      'insurance_claim',
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
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'insurance_claim_status_changed'
      ELSE 'insurance_claim_updated'
    END;

    PERFORM public.log_audit_event(
      NEW.tenant_id,
      auth.uid(),
      action_name,
      'insurance_claim',
      NEW.id,
      jsonb_build_object('fields', COALESCE(changed_fields, ARRAY[]::text[]))
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_patient_documents_changes ON public.patient_documents;
CREATE TRIGGER audit_patient_documents_changes
AFTER INSERT OR DELETE ON public.patient_documents
FOR EACH ROW EXECUTE FUNCTION public.audit_patient_documents_changes();

DROP TRIGGER IF EXISTS audit_prescriptions_changes ON public.prescriptions;
CREATE TRIGGER audit_prescriptions_changes
AFTER INSERT OR UPDATE ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.audit_prescriptions_changes();

DROP TRIGGER IF EXISTS audit_lab_orders_changes ON public.lab_orders;
CREATE TRIGGER audit_lab_orders_changes
AFTER INSERT OR UPDATE ON public.lab_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_lab_orders_changes();

DROP TRIGGER IF EXISTS audit_insurance_claims_changes ON public.insurance_claims;
CREATE TRIGGER audit_insurance_claims_changes
AFTER INSERT OR UPDATE ON public.insurance_claims
FOR EACH ROW EXECUTE FUNCTION public.audit_insurance_claims_changes();
