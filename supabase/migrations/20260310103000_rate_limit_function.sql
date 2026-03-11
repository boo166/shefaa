-- Durable rate limiting for edge functions (DB-backed)
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
  _max_hits integer,
  _window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_start timestamptz;
  current_hits integer;
  window_seconds integer := COALESCE(_window_seconds, 60);
  max_hits integer := COALESCE(_max_hits, 0);
BEGIN
  IF window_seconds <= 0 THEN
    window_seconds := 60;
  END IF;

  IF max_hits <= 0 THEN
    RETURN false;
  END IF;

  IF _key IS NULL OR length(btrim(_key)) = 0 THEN
    RETURN true;
  END IF;

  window_start := to_timestamp(
    floor(extract(epoch from now()) / window_seconds) * window_seconds
  );

  INSERT INTO public.rate_limits (key, window_start, hits)
  VALUES (_key, window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE
    SET hits = public.rate_limits.hits + 1,
        updated_at = now()
  RETURNING hits INTO current_hits;

  IF current_hits IS NULL THEN
    current_hits := 1;
  END IF;

  -- Opportunistic cleanup to keep the table bounded.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits
    WHERE window_start < now() - interval '1 day';
  END IF;

  RETURN current_hits <= max_hits;
END;
$$;
