-- Server-side patient_code generation to avoid client-side races

CREATE SEQUENCE IF NOT EXISTS public.patient_code_seq;

CREATE OR REPLACE FUNCTION public.generate_patient_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _next bigint;
BEGIN
  IF NEW.patient_code IS NULL OR length(trim(NEW.patient_code)) = 0 THEN
    SELECT nextval('public.patient_code_seq') INTO _next;
    NEW.patient_code := 'PT-' || lpad(_next::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_patient_code ON public.patients;
CREATE TRIGGER set_patient_code
BEFORE INSERT ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.generate_patient_code();

-- Initialize sequence to max existing numeric suffix to avoid collisions
DO $$
DECLARE
  _max_val bigint;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(patient_code, '\\D', '', 'g'), '')::bigint), 0)
  INTO _max_val
  FROM public.patients;

  PERFORM setval('public.patient_code_seq', GREATEST(_max_val, 1), _max_val > 0);
END;
$$;
