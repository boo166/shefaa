
-- Create patient_documents table
CREATE TABLE public.patient_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  file_type text NOT NULL DEFAULT 'application/octet-stream',
  uploaded_by uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_documents ENABLE ROW LEVEL SECURITY;

-- Clinical staff can view documents in their tenant
CREATE POLICY "Tenant users can view patient documents" ON public.patient_documents
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Authorized users can upload documents
CREATE POLICY "Authorized users can insert patient documents" ON public.patient_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'clinic_admin') OR has_role(auth.uid(), 'doctor') OR has_role(auth.uid(), 'nurse'))
  );

-- Admins can delete documents
CREATE POLICY "Admins can delete patient documents" ON public.patient_documents
  FOR DELETE TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()) AND has_role(auth.uid(), 'clinic_admin'));

-- Create doctor_schedules table
CREATE TABLE public.doctor_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(doctor_id, day_of_week)
);

ALTER TABLE public.doctor_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view schedules" ON public.doctor_schedules
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins and doctors can manage schedules" ON public.doctor_schedules
  FOR ALL TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'clinic_admin') OR has_role(auth.uid(), 'doctor'))
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (has_role(auth.uid(), 'clinic_admin') OR has_role(auth.uid(), 'doctor'))
  );

-- Create patient-documents storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-documents', 'patient-documents', false);

-- Storage RLS: users in the same tenant can read documents
CREATE POLICY "Tenant users can read patient documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-documents');

-- Authorized users can upload
CREATE POLICY "Authorized users can upload patient documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-documents');

-- Admins can delete
CREATE POLICY "Admins can delete patient documents from storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'patient-documents');
