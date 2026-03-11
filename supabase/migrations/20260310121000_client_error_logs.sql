-- Client-side error logging (for ErrorBoundary)
CREATE TABLE IF NOT EXISTS public.client_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  stack text,
  component_stack text,
  url text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own client error logs"
ON public.client_error_logs
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND user_id = auth.uid()
);

CREATE POLICY "Admins can view tenant client error logs"
ON public.client_error_logs
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
);

CREATE INDEX IF NOT EXISTS client_error_logs_tenant_created_at_idx
ON public.client_error_logs (tenant_id, created_at DESC);
