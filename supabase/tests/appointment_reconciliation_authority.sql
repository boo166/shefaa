begin;

select plan(4);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.appointment_reconciliation_findings,
  public.appointment_reconciliation_runs,
  public.appointment_queue,
  public.appointments,
  public.doctors,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000020', 'authenticated', 'authenticated', 'appt-recon@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('70000000-0000-0000-0000-000000000020', 'Appt Recon Tenant', 'appt-recon-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('72000000-0000-0000-0000-000000000020', '71000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000020', 'Recon User');

insert into public.user_roles (id, user_id, role)
values ('73000000-0000-0000-0000-000000000020', '71000000-0000-0000-0000-000000000020', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('74000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000020', 'RECON-1', 'Drift Patient', 'active');

insert into public.doctors (id, tenant_id, user_id, full_name, specialty, status)
values ('75000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000020', '71000000-0000-0000-0000-000000000020', 'Recon Doctor', 'General', 'available');

insert into public.appointments (id, tenant_id, patient_id, doctor_id, appointment_date, appointment_range, status, type, updated_at)
values ('76000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000020', '74000000-0000-0000-0000-000000000020', '75000000-0000-0000-0000-000000000020', now(), tstzrange(now(), now() + interval '30 minutes'), 'completed', 'checkup', now());

insert into public.appointment_queue (id, appointment_id, tenant_id, status, check_in_at, updated_at)
values ('77000000-0000-0000-0000-000000000020', '76000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000020', 'waiting', now(), now());

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000020', true);

select ok(
  (select critical_count from public.run_appointment_reconciliation(
    '70000000-0000-0000-0000-000000000020',
    now() - interval '1 day',
    now() + interval '1 day',
    false
  )) >= 1,
  'reconciliation detects completed with active queue drift'
);

select ok(
  exists (
    select 1 from public.appointment_reconciliation_findings
    where tenant_id = '70000000-0000-0000-0000-000000000020'
      and finding_code = 'COMPLETED_WITH_ACTIVE_QUEUE'
      and severity = 'critical'
  ),
  'COMPLETED_WITH_ACTIVE_QUEUE finding persisted'
);

set local role postgres;
update public.appointments set status = 'cancelled', updated_at = now() where id = '76000000-0000-0000-0000-000000000020';
update public.appointment_queue set status = 'called', updated_at = now() where id = '77000000-0000-0000-0000-000000000020';

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000020', true);

select ok(
  (select critical_count from public.run_appointment_reconciliation(
    '70000000-0000-0000-0000-000000000020',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  )) >= 1,
  'dry run detects cancelled with active queue drift'
);

select ok(
  exists (
    select 1
    from public.appointments a
    join public.appointment_queue q on q.appointment_id = a.id
    where a.id = '76000000-0000-0000-0000-000000000020'
      and a.status = 'cancelled'
      and q.status in ('waiting', 'called', 'in_service')
  ),
  'cancelled with active queue drift fixture is present'
);

select * from finish();
rollback;
