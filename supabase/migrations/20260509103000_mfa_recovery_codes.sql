-- MFA backup recovery codes (hashed at rest). Consumed via SECURITY DEFINER RPCs only.
-- See docs/MFA_SECURITY_MODEL.md for JWT AAL limitations after recovery redemption.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.mfa_recovery_code_hashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_mfa_recovery_user_hash UNIQUE (user_id, code_hash)
);

CREATE INDEX IF NOT EXISTS ix_mfa_recovery_user_unused
  ON public.mfa_recovery_code_hashes (user_id)
  WHERE used_at IS NULL;

ALTER TABLE public.mfa_recovery_code_hashes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mfa_recovery_code_hashes_no_direct_access" ON public.mfa_recovery_code_hashes;
CREATE POLICY "mfa_recovery_code_hashes_no_direct_access"
  ON public.mfa_recovery_code_hashes
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.mfa_recovery_code_hashes FROM PUBLIC;
REVOKE ALL ON TABLE public.mfa_recovery_code_hashes FROM anon;
REVOKE ALL ON TABLE public.mfa_recovery_code_hashes FROM authenticated;

-- Replace any unused codes with a new set; returns plaintext once per row.
CREATE OR REPLACE FUNCTION public.generate_mfa_recovery_codes(p_count integer DEFAULT 10)
RETURNS TABLE (plain_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  i int;
  plain_raw text;
  h text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_count IS NULL OR p_count < 8 OR p_count > 20 THEN
    RAISE EXCEPTION 'invalid count';
  END IF;

  DELETE FROM public.mfa_recovery_code_hashes
  WHERE user_id = uid AND used_at IS NULL;

  FOR i IN 1..p_count LOOP
    plain_raw := upper(
      substring(encode(gen_random_bytes(4), 'hex'), 1, 4) || '-' ||
      substring(encode(gen_random_bytes(4), 'hex'), 1, 4) || '-' ||
      substring(encode(gen_random_bytes(4), 'hex'), 1, 4)
    );
    h := encode(digest(convert_to(lower(trim(plain_raw)), 'UTF8'), 'sha256'), 'hex');
    INSERT INTO public.mfa_recovery_code_hashes (user_id, code_hash)
    VALUES (uid, h);
    plain_code := plain_raw;
    RETURN NEXT;
  END LOOP;
END;
$$;

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
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_mfa_recovery_codes(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_mfa_recovery_code(text) TO authenticated;
