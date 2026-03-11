begin;

select plan(5);

set local role postgres;
set local session_replication_role = replica;

insert into public.tenants (id, name, slug)
values
  ('00000000-0000-0000-0000-000000000011', 'Tenant One', 'tenant-one'),
  ('00000000-0000-0000-0000-000000000022', 'Tenant Two', 'tenant-two');

insert into public.profiles (id, user_id, tenant_id, full_name)
values
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'User One'),
  ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000022', 'User Two');

insert into public.user_roles (id, user_id, role)
values
  ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000011', 'clinic_admin'),
  ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000022', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values
  ('00000000-0000-0000-0000-000000001111', '00000000-0000-0000-0000-000000000011', 'PT-1001', 'Patient One', 'active'),
  ('00000000-0000-0000-0000-000000002222', '00000000-0000-0000-0000-000000000022', 'PT-2001', 'Patient Two', 'active');

insert into public.invoices (tenant_id, patient_id, invoice_code, service, amount, status)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001111', 'INV-A', 'Consult', 100, 'paid'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001111', 'INV-B', 'Consult', 50, 'pending'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000002222', 'INV-C', 'Consult', 500, 'paid');

insert into public.medications (tenant_id, name, category, stock, unit, price, status)
values
  ('00000000-0000-0000-0000-000000000011', 'Med A', 'General', 10, 'tabs', 5, 'in_stock'),
  ('00000000-0000-0000-0000-000000000022', 'Med B', 'General', 20, 'tabs', 7, 'low_stock');

insert into public.insurance_claims (tenant_id, patient_id, provider, service, amount, status)
values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001111', 'InsureCo', 'Visit', 150, 'pending'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000002222', 'OtherInsure', 'Visit', 200, 'approved');

insert into storage.objects (bucket_id, name, owner)
values
  ('patient-documents', '00000000-0000-0000-0000-000000000011/doc-a.pdf', '00000000-0000-0000-0000-000000000011'),
  ('patient-documents', '00000000-0000-0000-0000-000000000022/doc-b.pdf', '00000000-0000-0000-0000-000000000022');

set local session_replication_role = origin;

select public.refresh_report_materialized_views();

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select total_count from public.get_invoice_summary()),
  2::bigint,
  'Invoice summary returns tenant scoped total count'
);

select is(
  (select paid_amount from public.get_invoice_summary()),
  100::numeric,
  'Invoice summary returns tenant scoped paid amount'
);

select is(
  (select total_count from public.get_medication_summary()),
  1::bigint,
  'Medication summary returns tenant scoped total count'
);

select is(
  (select providers_count from public.get_insurance_summary()),
  1::bigint,
  'Insurance summary returns tenant scoped provider count'
);

select is(
  (select count(*) from storage.objects where bucket_id = 'patient-documents'),
  1::bigint,
  'Storage policies restrict patient documents to tenant paths'
);

select * from finish();
rollback;
