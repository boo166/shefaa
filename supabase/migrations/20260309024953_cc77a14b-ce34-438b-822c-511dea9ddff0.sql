-- Lock down legacy tenant-creation RPC overloads so clients cannot call them directly
REVOKE ALL ON FUNCTION public.create_tenant_and_signup(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_tenant_and_signup(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.create_tenant_and_signup(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_tenant_and_signup(text, text, text) FROM authenticated;