begin;

select plan(12);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.appointment_reconciliation_findings,
  public.appointment_reconciliation_runs,
  public.command_idempotency,
  public.audit_logs,
  public.domain_events,
  public.event_outbox,
  public.appointment_queue,
  public.appointments,
  public.doctors,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '71000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'appt-invariant@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('70000000-0000-0000-0000-000000000010', 'Queue Invariant Tenant', 'queue-invariant-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('72000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', 'Invariant User');

insert into public.user_roles (id, user_id, role)
values ('73000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000010', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values
  ('74000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', 'INV-1', 'Complete Patient', 'active'),
  ('74000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000010', 'INV-2', 'Cancel Patient', 'active'),
  ('74000000-0000-0000-0000-000000000012', '70000000-0000-0000-0000-000000000010', 'INV-3', 'NoShow Patient', 'active');

insert into public.doctors (id, tenant_id, user_id, full_name, specialty, status)
values ('75000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', '71000000-0000-0000-0000-000000000010', 'Invariant Doctor', 'General', 'available');

insert into public.appointments (id, tenant_id, patient_id, doctor_id, appointment_date, appointment_range, status, type, updated_at)
values
  ('76000000-0000-0000-0000-000000000010', '70000000-0000-0000-0000-000000000010', '74000000-0000-0000-0000-000000000010', '75000000-0000-0000-0000-000000000010', now() + interval '1 day', tstzrange(now() + interval '1 day', now() + interval '1 day 30 minutes'), 'scheduled', 'checkup', now()),
  ('76000000-0000-0000-0000-000000000011', '70000000-0000-0000-0000-000000000010', '74000000-0000-0000-0000-000000000011', '75000000-0000-0000-0000-000000000010', now() + interval '2 days', tstzrange(now() + interval '2 days', now() + interval '2 days 30 minutes'), 'scheduled', 'checkup', now()),
  ('76000000-0000-0000-0000-000000000012', '70000000-0000-0000-0000-000000000010', '74000000-0000-0000-0000-000000000012', '75000000-0000-0000-0000-000000000010', now() + interval '3 days', tstzrange(now() + interval '3 days', now() + interval '3 days 30 minutes'), 'scheduled', 'checkup', now());

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Complete path
select is((select result_code from public.command_appointment_lifecycle('check_in', '76000000-0000-0000-0000-000000000010', null, '70000000-0000-0000-0000-000000000010', null, 'inv-ci-1', 'h1', '71000000-0000-0000-0000-000000000010', 'r1', 'o1', 'wf-complete')), 'OK', 'complete path: check in');
select is((select result_code from public.command_appointment_lifecycle('call', '76000000-0000-0000-0000-000000000010', (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000010'), '70000000-0000-0000-0000-000000000010', null, 'inv-call-1', 'h2', '71000000-0000-0000-0000-000000000010', 'r2', 'o2', 'wf-complete')), 'OK', 'complete path: call');
select is((select result_code from public.command_appointment_lifecycle('start', '76000000-0000-0000-0000-000000000010', (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000010'), '70000000-0000-0000-0000-000000000010', null, 'inv-start-1', 'h3', '71000000-0000-0000-0000-000000000010', 'r3', 'o3', 'wf-complete')), 'OK', 'complete path: start');
select is((select result_code from public.command_appointment_lifecycle('complete', '76000000-0000-0000-0000-000000000010', (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000010'), '70000000-0000-0000-0000-000000000010', null, 'inv-done-1', 'h4', '71000000-0000-0000-0000-000000000010', 'r4', 'o4', 'wf-complete')), 'OK', 'complete path: complete');

select is(
  (select count(*) from public.appointment_queue q
   join public.appointments a on a.id = q.appointment_id
   where a.id = '76000000-0000-0000-0000-000000000010'
     and a.status = 'completed'
     and q.status in ('waiting', 'called', 'in_service')),
  0::bigint,
  'completed appointment has no active queue entry'
);

-- Cancel path
select is((select result_code from public.command_appointment_lifecycle('check_in', '76000000-0000-0000-0000-000000000011', null, '70000000-0000-0000-0000-000000000010', null, 'inv-ci-2', 'h5', '71000000-0000-0000-0000-000000000010', 'r5', 'o5', 'wf-cancel')), 'OK', 'cancel path: check in');
select is((select result_code from public.command_appointment_lifecycle('cancel', '76000000-0000-0000-0000-000000000011', null, '70000000-0000-0000-0000-000000000010', null, 'inv-cancel-1', 'h6', '71000000-0000-0000-0000-000000000010', 'r6', 'o6', 'wf-cancel')), 'OK', 'cancel path: cancel');

select is(
  (select count(*) from public.appointment_queue q
   join public.appointments a on a.id = q.appointment_id
   where a.id = '76000000-0000-0000-0000-000000000011'
     and a.status = 'cancelled'
     and q.status in ('waiting', 'called', 'in_service')),
  0::bigint,
  'cancelled appointment has no active queue entry'
);

-- No-show path
select is((select result_code from public.command_appointment_lifecycle('check_in', '76000000-0000-0000-0000-000000000012', null, '70000000-0000-0000-0000-000000000010', null, 'inv-ci-3', 'h7', '71000000-0000-0000-0000-000000000010', 'r7', 'o7', 'wf-noshow')), 'OK', 'no-show path: check in');
select is((select result_code from public.command_appointment_lifecycle('no_show', null, (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000012'), '70000000-0000-0000-0000-000000000010', null, 'inv-ns-1', 'h8', '71000000-0000-0000-0000-000000000010', 'r8', 'o8', 'wf-noshow')), 'OK', 'no-show path: mark no show');

select is(
  (select count(*) from public.appointment_queue q
   join public.appointments a on a.id = q.appointment_id
   where a.id = '76000000-0000-0000-0000-000000000012'
     and a.status = 'no_show'
     and q.status = 'waiting'),
  0::bigint,
  'no-show appointment has no waiting queue entry'
);

select is(
  (select critical_count from public.run_appointment_reconciliation(
    '70000000-0000-0000-0000-000000000010',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  )),
  0::bigint,
  'reconciliation reports zero critical findings after valid lifecycles'
);

select * from finish();
rollback;
