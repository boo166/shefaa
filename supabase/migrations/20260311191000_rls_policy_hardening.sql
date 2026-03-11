-- RLS hardening: ensure UPDATE policies enforce tenant/user invariants

-- Appointments
DROP POLICY IF EXISTS "Authorized users can update appointments" ON public.appointments;
CREATE POLICY "Authorized users can update appointments"
  ON public.appointments
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'doctor'::app_role)
      OR has_role(auth.uid(), 'receptionist'::app_role)
    )
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'doctor'::app_role)
      OR has_role(auth.uid(), 'receptionist'::app_role)
    )
  );

-- Invoices
DROP POLICY IF EXISTS "Billing users can update invoices" ON public.invoices;
CREATE POLICY "Billing users can update invoices"
  ON public.invoices
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
    )
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
    )
  );

-- Insurance claims
DROP POLICY IF EXISTS "Billing users can update claims" ON public.insurance_claims;
CREATE POLICY "Billing users can update claims"
  ON public.insurance_claims
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
    )
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'accountant'::app_role)
    )
  );

-- Lab orders
DROP POLICY IF EXISTS "Clinic admins can update lab orders" ON public.lab_orders;
DROP POLICY IF EXISTS "Doctors can update lab orders" ON public.lab_orders;
CREATE POLICY "Clinic admins can update lab orders"
  ON public.lab_orders
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), 'clinic_admin'::app_role)
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND has_role(auth.uid(), 'clinic_admin'::app_role)
  );

-- Prescriptions
DROP POLICY IF EXISTS "Doctors can update prescriptions" ON public.prescriptions;
CREATE POLICY "Doctors can update prescriptions"
  ON public.prescriptions
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'doctor'::app_role)
    )
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'doctor'::app_role)
    )
  );

-- Medical records
DROP POLICY IF EXISTS "Doctors can update records" ON public.medical_records;
CREATE POLICY "Doctors can update records"
  ON public.medical_records
  FOR UPDATE TO authenticated
  USING (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'doctor'::app_role)
    )
  )
  WITH CHECK (
    tenant_id = get_user_tenant_id(auth.uid())
    AND (
      has_role(auth.uid(), 'clinic_admin'::app_role)
      OR has_role(auth.uid(), 'doctor'::app_role)
    )
  );

-- Doctors
DROP POLICY IF EXISTS "Admins can manage doctors" ON public.doctors;
CREATE POLICY "Admins can manage doctors"
  ON public.doctors
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(), 'clinic_admin'::app_role)
  );

-- Notification preferences (user-owned)
DROP POLICY IF EXISTS "Users can update own preferences" ON public.notification_preferences;
CREATE POLICY "Users can update own preferences"
  ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Notifications (user-owned)
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- User preferences (user-owned)
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
CREATE POLICY "Users can update own preferences"
  ON public.user_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
