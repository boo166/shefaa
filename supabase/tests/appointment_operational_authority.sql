begin;

select plan(25);

set local role postgres;
set local session_replication_role = replica;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);

truncate
  public.dead_letter_events,
  public.event_delivery_attempts,
  public.event_outbox,
  public.domain_events,
  public.system_logs,
  public.command_idempotency,
  public.audit_logs,
  public.appointment_queue,
  public.appointments,
  public.doctors,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

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
values (
  '00000000-0000-0000-0000-000000000000',
  '71000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'appointment-command@test.com',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values
  ('70000000-0000-0000-0000-000000000001', 'Appointment Command Tenant', 'appointment-command-tenant', 'active', now()),
  ('70000000-0000-0000-0000-000000000002', 'Foreign Appointment Tenant', 'foreign-appointment-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Appointment Command User');

insert into public.user_roles (id, user_id, role)
values ('73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values
  ('74000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'APPT-CMD-1', 'Lifecycle Patient One', 'active'),
  ('74000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'APPT-CMD-2', 'Lifecycle Patient Two', 'active'),
  ('74000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 'APPT-CMD-3', 'Lifecycle Patient Three', 'active'),
  ('74000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000002', 'APPT-CMD-F', 'Foreign Lifecycle Patient', 'active');

insert into public.doctors (id, tenant_id, user_id, full_name, specialty, status)
values
  ('75000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Lifecycle Doctor', 'General', 'available'),
  ('75000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000002', null, 'Foreign Lifecycle Doctor', 'General', 'available');

insert into public.appointments (id, tenant_id, patient_id, doctor_id, appointment_date, appointment_range, status, type)
values
  ('76000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', '75000000-0000-0000-0000-000000000001', '2026-06-07T09:00:00Z', tstzrange('2026-06-07T09:00:00Z', '2026-06-07T09:30:00Z', '[)'), 'scheduled', 'checkup'),
  ('76000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000002', '75000000-0000-0000-0000-000000000001', '2026-06-07T10:00:00Z', tstzrange('2026-06-07T10:00:00Z', '2026-06-07T10:30:00Z', '[)'), 'scheduled', 'checkup'),
  ('76000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000003', '75000000-0000-0000-0000-000000000001', '2026-06-07T11:00:00Z', tstzrange('2026-06-07T11:00:00Z', '2026-06-07T11:30:00Z', '[)'), 'scheduled', 'checkup'),
  ('76000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000004', '75000000-0000-0000-0000-000000000002', '2026-06-07T09:00:00Z', tstzrange('2026-06-07T09:00:00Z', '2026-06-07T09:30:00Z', '[)'), 'scheduled', 'checkup');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'check_in',
    '76000000-0000-0000-0000-000000000001',
    null,
    '70000000-0000-0000-0000-000000000001',
    null,
    'appt-check-in-1',
    'check-in-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-appt-1',
    'op-appt-1',
    'wf-appt-1'
  )),
  'OK',
  'appointment check-in command commits successfully'
);

set local role postgres;

select is(
  (select status from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000001'),
  'waiting',
  'check-in creates a waiting queue entry'
);

select is(
  (select status from public.appointments where id = '76000000-0000-0000-0000-000000000001'),
  'scheduled',
  'check-in keeps appointment scheduled'
);

select is(
  (select count(*) from public.domain_events where event_type = 'AppointmentLifecycleTransitioned'),
  1::bigint,
  'appointment lifecycle command creates a domain event'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'AppointmentLifecycleTransitioned'),
  3::bigint,
  'appointment lifecycle command creates durable outbox rows'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'appointment_lifecycle_check_in'
      and details->>'appointment_id' = '76000000-0000-0000-0000-000000000001'
      and details->>'queue_status' = 'waiting'
      and details->>'workflow_trace_id' = 'wf-appt-1'
  ),
  'check-in audit evidence includes appointment, queue status, actor, and trace ids'
);

select throws_ok(
  $$
  select * from public.command_appointment_lifecycle(
    'check_in',
    '76000000-0000-0000-0000-000000000001',
    null,
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-duplicate-active',
    'op-appt-duplicate-active',
    'wf-appt-duplicate-active'
  );
  $$,
  '23505',
  'Appointment is already checked in',
  'duplicate active queue entries are rejected'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'call',
    null,
    (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000001'),
    '70000000-0000-0000-0000-000000000001',
    null,
    'appt-call-1',
    'call-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-appt-2',
    'op-appt-2',
    'wf-appt-2'
  )),
  'OK',
  'call command commits successfully'
);

select ok(
  (select idempotency_replay from public.command_appointment_lifecycle(
    'call',
    null,
    (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000001'),
    '70000000-0000-0000-0000-000000000001',
    null,
    'appt-call-1',
    'call-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-appt-2',
    'op-appt-2',
    'wf-appt-2'
  )),
  'idempotency replay returns committed command result'
);

set local role postgres;

select is(
  (select count(*) from public.domain_events where payload->>'operation' = 'call'),
  1::bigint,
  'idempotency replay does not create a duplicate call event'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'start',
    null,
    (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000001'),
    '70000000-0000-0000-0000-000000000001',
    '2000-01-01T00:00:00Z',
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-stale',
    'op-appt-stale',
    'wf-appt-stale'
  )),
  'CONFLICT',
  'stale expected queue timestamp returns a retryable conflict'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'wait',
    null,
    (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000001'),
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-wait',
    'op-appt-wait',
    'wf-appt-wait'
  )),
  'OK',
  'called queue entry can return to waiting without broadening appointment rollback'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'call',
    null,
    (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000001'),
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-3',
    'op-appt-3',
    'wf-appt-3'
  )),
  'OK',
  'queue entry can be called again after returning to waiting'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'start',
    null,
    (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000001'),
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-4',
    'op-appt-4',
    'wf-appt-4'
  )),
  'OK',
  'start visit command commits successfully'
);

select is(
  (select q.status || ':' || a.status
   from public.appointment_queue q
   join public.appointments a on a.id = q.appointment_id
   where q.appointment_id = '76000000-0000-0000-0000-000000000001'),
  'in_service:in_progress',
  'start visit converges queue and appointment status'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'complete',
    null,
    (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000001'),
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-5',
    'op-appt-5',
    'wf-appt-5'
  )),
  'OK',
  'complete visit command commits successfully'
);

select is(
  (select q.status || ':' || a.status
   from public.appointment_queue q
   join public.appointments a on a.id = q.appointment_id
   where q.appointment_id = '76000000-0000-0000-0000-000000000001'),
  'done:completed',
  'complete visit converges queue and appointment status'
);

select throws_ok(
  $$
  select * from public.command_appointment_lifecycle(
    'check_in',
    '76000000-0000-0000-0000-000000000001',
    null,
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-duplicate',
    'op-appt-duplicate',
    'wf-appt-duplicate'
  );
  $$,
  'P0001',
  'Only scheduled appointments can be checked in',
  'terminal completed appointments cannot be checked in again'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'check_in',
    '76000000-0000-0000-0000-000000000002',
    null,
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-cancel-checkin',
    'op-appt-cancel-checkin',
    'wf-appt-cancel-checkin'
  )),
  'OK',
  'second appointment check-in prepares active queue cancellation proof'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'cancel',
    '76000000-0000-0000-0000-000000000002',
    null,
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-cancel',
    'op-appt-cancel',
    'wf-appt-cancel'
  )),
  'OK',
  'cancel command commits successfully'
);

select is(
  (select q.status || ':' || a.status
   from public.appointment_queue q
   join public.appointments a on a.id = q.appointment_id
   where q.appointment_id = '76000000-0000-0000-0000-000000000002'),
  'done:cancelled',
  'cancellation closes any active queue entry and prevents cancelled plus active queue'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'check_in',
    '76000000-0000-0000-0000-000000000003',
    null,
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-noshow-checkin',
    'op-appt-noshow-checkin',
    'wf-appt-noshow-checkin'
  )),
  'OK',
  'third appointment check-in prepares no-show proof'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'no_show',
    null,
    (select id from public.appointment_queue where appointment_id = '76000000-0000-0000-0000-000000000003'),
    '70000000-0000-0000-0000-000000000001',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-noshow',
    'op-appt-noshow',
    'wf-appt-noshow'
  )),
  'OK',
  'no-show command commits successfully'
);

select is(
  (select q.status || ':' || a.status
   from public.appointment_queue q
   join public.appointments a on a.id = q.appointment_id
   where q.appointment_id = '76000000-0000-0000-0000-000000000003'),
  'no_show:no_show',
  'no-show converges queue and appointment status'
);

select throws_ok(
  $$
  select * from public.command_appointment_lifecycle(
    'check_in',
    '76000000-0000-0000-0000-000000000004',
    null,
    '70000000-0000-0000-0000-000000000002',
    null,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-appt-foreign',
    'op-appt-foreign',
    'wf-appt-foreign'
  );
  $$,
  '42501',
  'Tenant mismatch for appointment lifecycle command',
  'cross-tenant appointment lifecycle command is rejected'
);

select * from finish();
rollback;
