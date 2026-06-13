begin;

select plan(14);

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
  public.notifications,
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
  '91000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'appt-notif-trace@test.com',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('90000000-0000-0000-0000-000000000001', 'Appointment Notification Trace Tenant', 'appt-notif-trace-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Appointment Notification Actor');

insert into public.user_roles (id, user_id, role)
values ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('94000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'TRACE-PT-1', 'Trace Lifecycle Patient', 'active');

insert into public.doctors (id, tenant_id, user_id, full_name, specialty, status)
values ('95000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Trace Lifecycle Doctor', 'General', 'available');

insert into public.appointments (id, tenant_id, patient_id, doctor_id, appointment_date, appointment_range, status, type)
values (
  '96000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  '94000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  '2026-06-13T09:00:00Z',
  tstzrange('2026-06-13T09:00:00Z', '2026-06-13T09:30:00Z', '[)'),
  'scheduled',
  'checkup'
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'check_in',
    '96000000-0000-0000-0000-000000000001',
    null,
    '90000000-0000-0000-0000-000000000001',
    null,
    'trace-check-in-key',
    'trace-check-in-hash',
    '91000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    'op-trace-check-in',
    'wf-trace-appt-notif'
  )),
  'OK',
  'appointment check-in command commits successfully'
);

set local role postgres;

select is(
  (select count(*) from public.domain_events where event_type = 'AppointmentLifecycleTransitioned'),
  1::bigint,
  'check-in creates AppointmentLifecycleTransitioned domain event'
);

select domain_event_id as trace_domain_event_id
from public.domain_events
where event_type = 'AppointmentLifecycleTransitioned'
order by created_at desc
limit 1
\gset

select is(
  (select count(*) from public.event_outbox where domain_event_id = :'trace_domain_event_id'::uuid and handler_name = 'notifications'),
  1::bigint,
  'domain event creates notification outbox row'
);

select id as trace_notification_outbox_id
from public.event_outbox
where domain_event_id = :'trace_domain_event_id'::uuid
  and handler_name = 'notifications'
\gset

select ok(
  exists (
    select 1
    from public.event_outbox
    where id = :'trace_notification_outbox_id'::uuid
      and workflow_trace_id = 'wf-trace-appt-notif'
  ),
  'notification outbox inherits shared workflow trace from domain event'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'appointment_lifecycle_check_in'
      and details->>'appointment_id' = '96000000-0000-0000-0000-000000000001'
      and details->>'workflow_trace_id' = 'wf-trace-appt-notif'
      and details->>'domain_event_id' = :'trace_domain_event_id'
  ),
  'appointment lifecycle audit includes shared workflow trace and domain event lineage'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_notification_delivery(
    '90000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    'Appointment status updated',
    '{"event":"AppointmentLifecycleTransitioned","operation":"check_in"}',
    'system_event',
    (select 'notifications:90000000-0000-0000-0000-000000000001:' || id::text from public.event_outbox where id = :'trace_notification_outbox_id'::uuid),
    :'trace_domain_event_id'::uuid,
    :'trace_notification_outbox_id'::uuid,
    false,
    (select 'notifications:90000000-0000-0000-0000-000000000001:' || id::text from public.event_outbox where id = :'trace_notification_outbox_id'::uuid),
    '{"event_type":"AppointmentLifecycleTransitioned","aggregate_id":"96000000-0000-0000-0000-000000000001"}',
    '91000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    'op-trace-notif-delivery',
    'wf-trace-appt-notif'
  )),
  'OK',
  'notification delivery command commits successfully from appointment outbox lineage'
);

set local role postgres;

select is(
  (select source_event_id from public.notifications where source_outbox_id = :'trace_notification_outbox_id'::uuid),
  :'trace_domain_event_id'::uuid,
  'delivered notification stores source domain event lineage'
);

select is(
  (select source_outbox_id from public.notifications where source_outbox_id = :'trace_notification_outbox_id'::uuid),
  :'trace_notification_outbox_id'::uuid,
  'delivered notification stores source outbox lineage'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'notification_delivered'
      and details->>'sourceEventId' = :'trace_domain_event_id'
      and details->>'sourceOutboxId' = :'trace_notification_outbox_id'
      and details->>'workflowTraceId' = 'wf-trace-appt-notif'
  ),
  'notification delivery audit includes source lineage and shared workflow trace'
);

select ok(
  exists (
    select 1
    from public.audit_logs a1
    join public.audit_logs a2
      on a1.details->>'workflow_trace_id' = a2.details->>'workflowTraceId'
    where a1.action = 'appointment_lifecycle_check_in'
      and a2.action = 'notification_delivered'
      and a1.details->>'workflow_trace_id' = 'wf-trace-appt-notif'
  ),
  'appointment lifecycle and notification delivery audits share workflow trace id'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select ok(
  (select idempotency_replay from public.command_notification_delivery(
    '90000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    'Appointment status updated',
    '{"event":"AppointmentLifecycleTransitioned","operation":"check_in"}',
    'system_event',
    (select 'notifications:90000000-0000-0000-0000-000000000001:' || id::text from public.event_outbox where id = :'trace_notification_outbox_id'::uuid),
    :'trace_domain_event_id'::uuid,
    :'trace_notification_outbox_id'::uuid,
    false,
    (select 'notifications:90000000-0000-0000-0000-000000000001:' || id::text from public.event_outbox where id = :'trace_notification_outbox_id'::uuid),
    '{"event_type":"AppointmentLifecycleTransitioned","aggregate_id":"96000000-0000-0000-0000-000000000001"}',
    '91000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    'op-trace-notif-delivery',
    'wf-trace-appt-notif'
  )),
  'notification delivery replays idempotently by durable delivery key'
);

set local role postgres;

select is(
  (select count(*) from public.notifications where source_outbox_id = :'trace_notification_outbox_id'::uuid),
  1::bigint,
  'notification delivery replay does not duplicate notification rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'call',
    null,
    (select id from public.appointment_queue where appointment_id = '96000000-0000-0000-0000-000000000001'),
    '90000000-0000-0000-0000-000000000001',
    null,
    'trace-call-key',
    'trace-call-hash',
    '91000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000002',
    'op-trace-call',
    'wf-trace-appt-notif'
  )),
  'OK',
  'call command commits for ordering proof'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'start',
    null,
    (select id from public.appointment_queue where appointment_id = '96000000-0000-0000-0000-000000000001'),
    '90000000-0000-0000-0000-000000000001',
    null,
    'trace-start-key',
    'trace-start-hash',
    '91000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000003',
    'op-trace-start',
    'wf-trace-appt-notif'
  )),
  'OK',
  'start command commits for ordering proof'
);

select is(
  (select result_code from public.command_appointment_lifecycle(
    'complete',
    null,
    (select id from public.appointment_queue where appointment_id = '96000000-0000-0000-0000-000000000001'),
    '90000000-0000-0000-0000-000000000001',
    null,
    'trace-complete-key',
    'trace-complete-hash',
    '91000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000004',
    'op-trace-complete',
    'wf-trace-appt-notif'
  )),
  'OK',
  'complete command commits for ordering proof'
);

set local role postgres;

select is(
  (select count(distinct delivery_key) from public.notifications where delivery_key like 'notifications:90000000-0000-0000-0000-000000000001:%'),
  1::bigint,
  'lifecycle progression does not create duplicate notification delivery keys before worker delivery'
);

select is(
  (select count(*) from public.event_outbox where domain_event_id in (
    select id from public.domain_events where event_type = 'AppointmentLifecycleTransitioned'
  ) and handler_name = 'notifications'),
  4::bigint,
  'each lifecycle transition enqueues a distinct notification outbox row'
);

select * from finish();
rollback;
