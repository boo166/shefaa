-- Allow unauthenticated and authenticated clients to call rate limiter RPC
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;
