begin;

select plan(12);

-- Use a superuser role for setup to bypass RLS and foreign keys.
set local role postgres;
set local session_replication_role = replica;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

TRUNCATE
  public.audit_logs,
  public.patient_documents,
  public.insurance_claims,
  public.lab_orders,
  public.invoices,
  public.prescriptions,
  public.appointments,
  public.doctors,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
RESTART IDENTITY CASCADE;

insert into public.tenants (id, name, slug)
values
  ('00000000-0000-0000-0000-000000000001', 'Tenant One', 'tenant-one'),
  ('00000000-0000-0000-0000-000000000002', 'Tenant Two', 'tenant-two');

insert into public.profiles (id, user_id, tenant_id, full_name)
values
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'User One'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000002', 'User Two');

insert into public.user_roles (id, user_id, role)
values
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000011', 'clinic_admin'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000012', 'clinic_admin');

set local session_replication_role = origin;

insert into public.patients (tenant_id, patient_code, full_name, status)
values
  ('00000000-0000-0000-0000-000000000001', 'PT-000001', 'Patient A', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'PT-000002', 'Patient B', 'active');

insert into public.doctors (id, tenant_id, full_name, specialty, status)
values
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'Dr One', 'General', 'available'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000002', 'Dr Two', 'General', 'available');

insert into public.appointments (tenant_id, patient_id, doctor_id, appointment_date, status, type)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000001' limit 1), '00000000-0000-0000-0000-000000000301', '2026-03-10T09:00:00Z', 'scheduled', 'checkup'),
  ('00000000-0000-0000-0000-000000000002', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000002' limit 1), '00000000-0000-0000-0000-000000000302', '2026-03-10T10:00:00Z', 'scheduled', 'checkup');

insert into public.prescriptions (tenant_id, patient_id, doctor_id, medication, dosage, status)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000001' limit 1), '00000000-0000-0000-0000-000000000301', 'Rx One', '1/day', 'active'),
  ('00000000-0000-0000-0000-000000000002', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000002' limit 1), '00000000-0000-0000-0000-000000000302', 'Rx Two', '1/day', 'active');

insert into public.invoices (tenant_id, patient_id, invoice_code, service, amount, status)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000001' limit 1), 'INV-001', 'Consult', 100, 'paid'),
  ('00000000-0000-0000-0000-000000000002', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000002' limit 1), 'INV-002', 'Consult', 200, 'paid');

insert into public.lab_orders (tenant_id, patient_id, doctor_id, test_name, status)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000001' limit 1), '00000000-0000-0000-0000-000000000301', 'CBC', 'pending'),
  ('00000000-0000-0000-0000-000000000002', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000002' limit 1), '00000000-0000-0000-0000-000000000302', 'CBC', 'pending');

insert into public.insurance_claims (tenant_id, patient_id, provider, service, amount, status)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000001' limit 1), 'InsureCo', 'Visit', 150, 'pending'),
  ('00000000-0000-0000-0000-000000000002', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000002' limit 1), 'InsureCo', 'Visit', 150, 'pending');

insert into public.patient_documents (tenant_id, patient_id, file_name, file_path, file_size, file_type, uploaded_by)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000001' limit 1), 'doc-a.pdf', '00000000-0000-0000-0000-000000000001/doc-a.pdf', 10, 'application/pdf', '00000000-0000-0000-0000-000000000011'),
  ('00000000-0000-0000-0000-000000000002', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000002' limit 1), 'doc-b.pdf', '00000000-0000-0000-0000-000000000002/doc-b.pdf', 10, 'application/pdf', '00000000-0000-0000-0000-000000000012');

insert into public.audit_logs (tenant_id, user_id, action, entity_type, entity_id)
values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'update', 'patients', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000001' limit 1)),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', 'update', 'patients', (select id from public.patients where tenant_id = '00000000-0000-0000-0000-000000000002' limit 1));

-- Switch into an authenticated context for RLS tests.
set local role authenticated;
set local row_security = on;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.patients),
  1::bigint,
  'Tenant user sees only their tenant patients'
);

select lives_ok(
  $$
  insert into public.patients (tenant_id, patient_code, full_name, status)
  values ('00000000-0000-0000-0000-000000000001', 'PT-000003', 'Patient C', 'active');
  $$,
  'Tenant user can insert patients in their tenant'
);

select throws_ok(
  $$
  insert into public.patients (tenant_id, patient_code, full_name, status)
  values ('00000000-0000-0000-0000-000000000002', 'PT-000004', 'Patient D', 'active');
  $$,
  '42501',
  'new row violates row-level security policy for table "patients"',
  'Tenant user cannot insert patients in other tenants'
);

select is(
  (select count(*) from public.appointments),
  1::bigint,
  'Tenant user sees only their tenant appointments'
);

select is(
  (select count(*) from public.prescriptions),
  1::bigint,
  'Tenant user sees only their tenant prescriptions'
);

select is(
  (select count(*) from public.invoices),
  1::bigint,
  'Tenant user sees only their tenant invoices'
);

select is(
  (select count(*) from public.lab_orders),
  1::bigint,
  'Tenant user sees only their tenant lab orders'
);

select is(
  (select count(*) from public.insurance_claims),
  1::bigint,
  'Tenant user sees only their tenant insurance claims'
);

select is(
  (select count(*) from public.patient_documents),
  1::bigint,
  'Tenant user sees only their tenant patient documents'
);

select is(
  (select count(*) from public.audit_logs),
  2::bigint,
  'Clinic admin can view audit logs in their tenant'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', true);
select is(
  (select count(*) from public.patients),
  1::bigint,
  'Other tenant user sees only their tenant patients'
);

select is(
  (select count(*) from public.audit_logs),
  1::bigint,
  'Other tenant admin sees only their audit logs'
);

select * from finish();
rollback;
