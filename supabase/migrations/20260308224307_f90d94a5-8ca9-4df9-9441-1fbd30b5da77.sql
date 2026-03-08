
-- Insert a default demo tenant for testing
INSERT INTO public.tenants (id, name, slug, email, phone, address)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'MedFlow Demo Clinic',
  'demo-clinic',
  'info@democlinic.com',
  '+966 11 234 5678',
  '123 King Fahd Road, Riyadh, Saudi Arabia'
) ON CONFLICT (id) DO NOTHING;

-- Allow unauthenticated users to insert tenants during signup
CREATE POLICY "Allow tenant creation during signup"
ON public.tenants FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create a function to create tenant + signup atomically  
CREATE OR REPLACE FUNCTION public.create_tenant_and_signup(
  _name text,
  _slug text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant_id uuid;
BEGIN
  INSERT INTO public.tenants (name, slug)
  VALUES (_name, _slug)
  RETURNING id INTO _tenant_id;
  RETURN _tenant_id;
END;
$$;
