
-- Audit log table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast tenant + time queries
CREATE INDEX idx_audit_logs_tenant_time ON public.audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

-- RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs in their tenant
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), 'clinic_admin'::app_role)
  );

-- No direct insert/update/delete from client
CREATE POLICY "No direct writes"
  ON public.audit_logs FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Server-side function to log audit events
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _tenant_id uuid,
  _user_id uuid,
  _action text,
  _entity_type text,
  _entity_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (_tenant_id, _user_id, _action, _entity_type, _entity_id, _details);
END;
$$;
