-- Align RLS with app RBAC permissions

-- Patients: view for clinical staff (exclude accountant), write for clinic_admin + receptionist
DROP POLICY IF EXISTS "Authorized users can view patients" ON public.patients;
DROP POLICY IF EXISTS "Authorized users can insert patients" ON public.patients;
DROP POLICY IF EXISTS "Authorized users can update patients" ON public.patients;
DROP POLICY IF EXISTS "Admins can delete patients" ON public.patients;

CREATE POLICY "Clinical staff can view patients"
ON public.patients
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'doctor'::app_role)
    OR public.has_role(auth.uid(), 'nurse'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);

CREATE POLICY "Clinic admins and receptionists can insert patients"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);

CREATE POLICY "Clinic admins and receptionists can update patients"
ON public.patients
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND (
    public.has_role(auth.uid(), 'clinic_admin'::app_role)
    OR public.has_role(auth.uid(), 'receptionist'::app_role)
  )
);

CREATE POLICY "Clinic admins can delete patients"
ON public.patients
FOR DELETE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
);

-- Lab orders: only clinic_admin can write
DROP POLICY IF EXISTS "Doctors can create lab orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Doctors can update lab orders" ON public.lab_orders;

CREATE POLICY "Clinic admins can create lab orders"
ON public.lab_orders
FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
);

CREATE POLICY "Clinic admins can update lab orders"
ON public.lab_orders
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
);

-- Medications: only clinic_admin can manage
DROP POLICY IF EXISTS "Authorized users can manage medications" ON public.medications;

CREATE POLICY "Clinic admins can manage medications"
ON public.medications
FOR ALL
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
);

-- Doctor schedules: clinic_admin only (avoid cross-doctor writes)
DROP POLICY IF EXISTS "Tenant users can view schedules" ON public.doctor_schedules;
DROP POLICY IF EXISTS "Admins and doctors can manage schedules" ON public.doctor_schedules;

CREATE POLICY "Clinic admins can view schedules"
ON public.doctor_schedules
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
);

CREATE POLICY "Clinic admins can manage schedules"
ON public.doctor_schedules
FOR ALL
TO authenticated
USING (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
  AND doctor_id IN (
    SELECT d.id FROM public.doctors d
    WHERE d.tenant_id = public.get_user_tenant_id(auth.uid())
  )
)
WITH CHECK (
  tenant_id = public.get_user_tenant_id(auth.uid())
  AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
  AND doctor_id IN (
    SELECT d.id FROM public.doctors d
    WHERE d.tenant_id = public.get_user_tenant_id(auth.uid())
  )
);
