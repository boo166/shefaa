begin;

select plan(3);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.command_idempotency,
  public.audit_logs,
  public.domain_events,
  public.appointments,
  public.doctors,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000030', 'authenticated', 'authenticated', 'patient-bulk@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('70000000-0000-0000-0000-000000000030', 'Bulk Archive Tenant', 'bulk-archive-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('72000000-0000-0000-0000-000000000030', '71000000-0000-0000-0000-000000000030', '70000000-0000-0000-0000-000000000030', 'Bulk User');

insert into public.user_roles (id, user_id, role)
values ('73000000-0000-0000-0000-000000000030', '71000000-0000-0000-0000-000000000030', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values
  ('74000000-0000-0000-0000-000000000031', '70000000-0000-0000-0000-000000000030', 'BULK-1', 'Bulk One', 'active'),
  ('74000000-0000-0000-0000-000000000032', '70000000-0000-0000-0000-000000000030', 'BULK-2', 'Bulk Two', 'active');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000030', true);

select is((select result_code from public.command_patient_lifecycle(
  'archive', '74000000-0000-0000-0000-000000000031', '70000000-0000-0000-0000-000000000030',
  '{}'::jsonb, null, 'bulk-1', 'h1', '71000000-0000-0000-0000-000000000030', 'r1', 'o1', 'wf-bulk'
)), 'OK', 'first patient archives via command');

select is((select result_code from public.command_patient_lifecycle(
  'archive', '74000000-0000-0000-0000-000000000032', '70000000-0000-0000-0000-000000000030',
  '{}'::jsonb, null, 'bulk-2', 'h2', '71000000-0000-0000-0000-000000000030', 'r2', 'o2', 'wf-bulk'
)), 'OK', 'second patient archives via command');

select is(
  (select count(*) from public.patients
   where tenant_id = '70000000-0000-0000-0000-000000000030'
     and deleted_at is not null),
  2::bigint,
  'bulk archive leaves both patients soft-deleted'
);

select * from finish();
rollback;
