begin;

select plan(39);
\set rls_suite true

set local role postgres;
set local session_replication_role = replica;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'rls-admin-a@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'rls-admin-b@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'rls-portal-a@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-0000-0000-000000000099',
    'authenticated',
    'authenticated',
    'rls-super-admin@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

truncate
  public.admin_impersonation_sessions,
  public.privileged_step_up_grants,
  public.audit_logs,
  public.admin_idempotency,
  public.billing_reconciliation_findings,
  public.billing_reconciliation_runs,
  public.command_idempotency,
  public.invoice_payments,
  public.insurance_claim_attachments,
  public.patient_documents,
  public.insurance_claims,
  public.lab_orders,
  public.prescriptions,
  public.medical_records,
  public.appointment_queue,
  public.appointments,
  public.doctor_schedules,
  public.doctors,
  public.invoices,
  public.patient_accounts,
  public.patients,
  public.user_global_roles,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into public.tenants (id, name, slug, status, status_changed_at)
values
  ('30000000-0000-0000-0000-000000000001', 'RLS Tenant A', 'rls-tenant-a', 'active', now()),
  ('30000000-0000-0000-0000-000000000002', 'RLS Tenant B', 'rls-tenant-b', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values
  ('32000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'RLS Admin A'),
  ('32000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'RLS Admin B'),
  ('32000000-0000-0000-0000-000000000099', '31000000-0000-0000-0000-000000000099', null, 'RLS Super Admin');

insert into public.user_roles (id, user_id, role)
values
  ('33000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'clinic_admin'),
  ('33000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'clinic_admin');

insert into public.user_global_roles (id, user_id, role)
values
  ('33000000-0000-0000-0000-000000000099', '31000000-0000-0000-0000-000000000099', 'super_admin');

insert into public.subscriptions (tenant_id, plan, status, amount, currency, billing_cycle, started_at)
values
  ('30000000-0000-0000-0000-000000000001', 'enterprise', 'active', 500, 'EGP', 'monthly', now()),
  ('30000000-0000-0000-0000-000000000002', 'enterprise', 'active', 500, 'EGP', 'monthly', now());

insert into public.feature_flags (tenant_id, feature_key, enabled)
values
  ('30000000-0000-0000-0000-000000000001', 'insurance_module', true),
  ('30000000-0000-0000-0000-000000000002', 'insurance_module', true);

insert into public.patients (id, tenant_id, patient_code, full_name, status, user_id, deleted_at)
values
  ('34000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'RLS-A-001', 'Tenant A Patient', 'active', '31000000-0000-0000-0000-000000000003', null),
  ('34000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'RLS-B-001', 'Tenant B Patient', 'active', null, null),
  ('34000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'RLS-A-DEL', 'Tenant A Deleted Patient', 'active', null, now());

insert into public.patient_accounts (id, tenant_id, patient_id, auth_user_id, status, activated_at)
values (
  '35000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000003',
  'active',
  now()
);

insert into public.doctors (id, tenant_id, full_name, specialty, status)
values
  ('36000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Tenant A Doctor', 'General', 'available'),
  ('36000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Tenant B Doctor', 'General', 'available');

insert into public.appointments (id, tenant_id, patient_id, doctor_id, appointment_date, appointment_range, status, type)
values
  ('37000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000001', '2026-05-11T09:00:00Z', tstzrange('2026-05-11T09:00:00Z', '2026-05-11T09:30:00Z', '[)'), 'scheduled', 'checkup'),
  ('37000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', '36000000-0000-0000-0000-000000000002', '2026-05-11T10:00:00Z', tstzrange('2026-05-11T10:00:00Z', '2026-05-11T10:30:00Z', '[)'), 'scheduled', 'checkup');

insert into public.appointment_queue (id, appointment_id, tenant_id, status)
values
  ('37100000-0000-0000-0000-000000000001', '37000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'waiting'),
  ('37100000-0000-0000-0000-000000000002', '37000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'waiting');

insert into public.prescriptions (id, tenant_id, patient_id, doctor_id, medication, dosage, status)
values
  ('37200000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000001', 'Rx A', '1/day', 'active'),
  ('37200000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', '36000000-0000-0000-0000-000000000002', 'Rx B', '1/day', 'active');

insert into public.lab_orders (id, tenant_id, patient_id, doctor_id, test_name, status)
values
  ('37300000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '36000000-0000-0000-0000-000000000001', 'CBC A', 'pending'),
  ('37300000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', '36000000-0000-0000-0000-000000000002', 'CBC B', 'pending');

insert into public.invoices (id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due, status)
values
  ('38000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'RLS-INV-A', 'Consult', 100, 50, 50, 'partially_paid'),
  ('38000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', 'RLS-INV-B', 'Consult', 200, 0, 200, 'pending');

insert into public.invoice_payments (id, tenant_id, invoice_id, patient_id, amount, payment_method, paid_at, created_by)
values
  ('38100000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 50, 'cash', now(), '31000000-0000-0000-0000-000000000001'),
  ('38100000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '38000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', 20, 'cash', now(), '31000000-0000-0000-0000-000000000002');

insert into public.command_idempotency (id, tenant_id, operation_type, idempotency_key, request_hash, status, updated_at)
values
  ('38200000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'invoice_payment_post', 'rls-key-a', 'hash-a', 'committed', now()),
  ('38200000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'invoice_payment_post', 'rls-key-b', 'hash-b', 'committed', now());

insert into public.billing_reconciliation_runs (id, tenant_id, window_start, window_end, finding_count, critical_count, warning_count)
values
  ('38300000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now() - interval '1 day', now(), 1, 1, 0),
  ('38300000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', now() - interval '1 day', now(), 1, 1, 0);

insert into public.billing_reconciliation_findings (id, run_id, tenant_id, invoice_id, finding_code, severity, evidence)
values
  ('38400000-0000-0000-0000-000000000001', '38300000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '38000000-0000-0000-0000-000000000001', 'RLS_FINDING_A', 'critical', '{}'::jsonb),
  ('38400000-0000-0000-0000-000000000002', '38300000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '38000000-0000-0000-0000-000000000002', 'RLS_FINDING_B', 'critical', '{}'::jsonb);

insert into public.insurance_claims (id, tenant_id, patient_id, provider, service, amount, status)
values
  ('38500000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'Payer A', 'Visit', 100, 'submitted'),
  ('38500000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', 'Payer B', 'Visit', 200, 'submitted');

insert into public.patient_documents (id, tenant_id, patient_id, file_name, file_path, file_size, file_type, uploaded_by)
values
  ('38600000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'doc-a.pdf', '30000000-0000-0000-0000-000000000001/patients/doc-a.pdf', 10, 'application/pdf', '31000000-0000-0000-0000-000000000001'),
  ('38600000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', 'doc-b.pdf', '30000000-0000-0000-0000-000000000002/patients/doc-b.pdf', 10, 'application/pdf', '31000000-0000-0000-0000-000000000002');

insert into public.insurance_claim_attachments (id, claim_id, tenant_id, file_name, file_path, file_size, file_type, attachment_type, uploaded_by)
values
  ('38700000-0000-0000-0000-000000000001', '38500000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'claim-a.pdf', '30000000-0000-0000-0000-000000000001/claims/claim-a.pdf', 10, 'application/pdf', 'eob', '31000000-0000-0000-0000-000000000001'),
  ('38700000-0000-0000-0000-000000000002', '38500000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'claim-b.pdf', '30000000-0000-0000-0000-000000000002/claims/claim-b.pdf', 10, 'application/pdf', 'eob', '31000000-0000-0000-0000-000000000002');

insert into public.audit_logs (
  id,
  tenant_id,
  user_id,
  actor_id,
  action,
  action_type,
  entity_type,
  resource_type,
  entity_id,
  resource_id,
  details,
  metadata,
  is_global
)
values
  ('38800000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'tenant_a_seed', 'tenant_a_seed', 'patient', 'patient', '34000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', '{}'::jsonb, '{}'::jsonb, false),
  ('38800000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'tenant_b_seed', 'tenant_b_seed', 'patient', 'patient', '34000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', '{}'::jsonb, '{}'::jsonb, false),
  ('38800000-0000-0000-0000-000000000099', null, '31000000-0000-0000-0000-000000000099', '31000000-0000-0000-0000-000000000099', 'global_seed', 'global_seed', 'tenant', 'tenant', null, null, '{}'::jsonb, '{}'::jsonb, true);

insert into public.privileged_step_up_grants (
  id,
  actor_id,
  role_tier,
  action_key,
  tenant_id,
  resource_id,
  session_id,
  expires_at
)
values
  ('38900000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000099', 'super_admin', 'tenant_impersonation_start', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'super-session-1', now() + interval '15 minutes'),
  ('38900000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000099', 'super_admin', 'tenant_impersonation_start', '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'super-session-1', now() + interval '15 minutes');

set local session_replication_role = origin;

\ir rls/patients_rls.sql
\ir rls/billing_rls.sql
\ir rls/appointments_rls.sql
\ir rls/documents_rls.sql
\ir rls/admin_rls.sql
\ir rls/impersonation_rls.sql

select * from finish();

rollback;
