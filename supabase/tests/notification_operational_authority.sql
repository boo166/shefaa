begin;

select plan(20);

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
  public.command_idempotency,
  public.audit_logs,
  public.notifications,
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
values
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'notification-command@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'notification-command-target@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '81000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'notification-command-foreign@test.com',
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
  ('80000000-0000-0000-0000-000000000001', 'Notification Command Tenant', 'notification-command-tenant', 'active', now()),
  ('80000000-0000-0000-0000-000000000002', 'Foreign Notification Tenant', 'foreign-notification-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Notification Actor'),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', 'Notification Target'),
  ('82000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000002', 'Foreign Notification User');

insert into public.user_roles (id, user_id, role)
values
  ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'clinic_admin'),
  ('83000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 'clinic_admin'),
  ('83000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000003', 'clinic_admin');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into public.domain_events (
  id,
  event_type,
  event_version,
  entity_type,
  entity_id,
  tenant_id,
  user_id,
  payload,
  request_trace_id,
  operation_trace_id,
  workflow_trace_id
)
values (
  '84000000-0000-0000-0000-000000000001',
  'AppointmentLifecycleTransitioned',
  1,
  'appointment',
  '85000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  '{"appointmentId":"85000000-0000-0000-0000-000000000001","operation":"complete"}'::jsonb,
  '86000000-0000-0000-0000-000000000001',
  'op-notification-command',
  'wf-notification-command'
);

select is(
  (select count(*) from public.event_outbox where domain_event_id = '84000000-0000-0000-0000-000000000001' and handler_name = 'notifications'),
  1::bigint,
  'source domain event creates notification outbox row'
);

select is(
  (select result_code from public.command_notification_delivery(
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'Appointment status updated',
    '{"event":"AppointmentLifecycleTransitioned"}',
    'system_event',
    'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001',
    (select id from public.event_outbox where domain_event_id = '84000000-0000-0000-0000-000000000001' and handler_name = 'notifications'),
    false,
    null,
    'delivery-hash-1',
    '81000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001',
    'op-notification-delivery',
    'wf-notification-delivery'
  )),
  'OK',
  'notification delivery command commits successfully'
);

set local role postgres;

select is(
  (select count(*) from public.notifications where delivery_key = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'),
  1::bigint,
  'delivery command materializes one notification with durable key'
);

select is(
  (select source_event_id from public.notifications where delivery_key = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'),
  '84000000-0000-0000-0000-000000000001'::uuid,
  'notification stores source event lineage'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'notification_delivered'
      and details->>'deliveryKey' = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'
      and details->>'requestTraceId' = '86000000-0000-0000-0000-000000000001'
      and details->>'workflowTraceId' = 'wf-notification-delivery'
  ),
  'delivery audit evidence includes durable identity, actor, and trace ids'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select ok(
  (select idempotency_replay from public.command_notification_delivery(
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'Appointment status updated',
    '{"event":"AppointmentLifecycleTransitioned"}',
    'system_event',
    'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001',
    (select id from public.event_outbox where domain_event_id = '84000000-0000-0000-0000-000000000001' and handler_name = 'notifications'),
    false,
    null,
    'delivery-hash-1',
    '81000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001',
    'op-notification-delivery',
    'wf-notification-delivery'
  )),
  'delivery command replays by durable delivery key'
);

set local role postgres;

select is(
  (select count(*) from public.notifications where delivery_key = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'),
  1::bigint,
  'idempotency replay does not duplicate notification rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$
  select * from public.command_notification_delivery(
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000003',
    'Wrong tenant target',
    null,
    'system_event',
    'notifications:wrong-target',
    null,
    null,
    false,
    null,
    null,
    '81000000-0000-0000-0000-000000000001',
    null,
    null,
    null
  );
  $$,
  '42501',
  'Notification recipient does not belong to tenant',
  'delivery rejects recipient from another tenant'
);

select throws_ok(
  $$
  select * from public.command_notification_delivery(
    '80000000-0000-0000-0000-000000000002',
    '81000000-0000-0000-0000-000000000003',
    'Wrong actor tenant',
    null,
    'system_event',
    'notifications:wrong-tenant',
    null,
    null,
    false,
    null,
    null,
    '81000000-0000-0000-0000-000000000001',
    null,
    null,
    null
  );
  $$,
  '42501',
  'Tenant mismatch for notification delivery command',
  'delivery rejects actor tenant mismatch'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is(
  (select result_code from public.command_notification_acknowledge(
    (select id from public.notifications where delivery_key = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'),
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    null,
    'ack-1',
    'ack-hash-1',
    '81000000-0000-0000-0000-000000000002',
    '86000000-0000-0000-0000-000000000002',
    'op-notification-ack',
    'wf-notification-ack'
  )),
  'OK',
  'acknowledgement command commits successfully'
);

select ok(
  (select read and acknowledged_at is not null from public.notifications where delivery_key = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'),
  'acknowledgement marks notification read and records acknowledged_at'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'notification_acknowledged'
      and details->>'deliveryKey' = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'
      and details->>'workflowTraceId' = 'wf-notification-ack'
  ),
  'acknowledgement audit evidence includes durable identity and trace ids'
);

select ok(
  (select idempotency_replay from public.command_notification_acknowledge(
    (select id from public.notifications where delivery_key = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'),
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    null,
    'ack-1',
    'ack-hash-1',
    '81000000-0000-0000-0000-000000000002',
    '86000000-0000-0000-0000-000000000002',
    'op-notification-ack',
    'wf-notification-ack'
  )),
  'acknowledgement command replays idempotently'
);

select is(
  (select result_code from public.command_notification_acknowledge(
    (select id from public.notifications where delivery_key = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'),
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    '2000-01-01T00:00:00Z',
    'ack-stale',
    'ack-stale-hash',
    '81000000-0000-0000-0000-000000000002',
    null,
    null,
    null
  )),
  'CONFLICT',
  'stale acknowledgement expected timestamp returns conflict'
);

select throws_ok(
  $$
  select * from public.command_notification_acknowledge(
    (select id from public.notifications where delivery_key = 'notifications:80000000-0000-0000-0000-000000000001:87000000-0000-0000-0000-000000000001'),
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    null,
    'ack-wrong-user',
    'ack-wrong-user-hash',
    '81000000-0000-0000-0000-000000000001',
    null,
    null,
    null
  );
  $$,
  '42501',
  'Notification acknowledgement user mismatch',
  'acknowledgement cannot mark another user notification'
);

select is(
  (select pending_notification_outbox from public.notification_delivery_drift('80000000-0000-0000-0000-000000000001')),
  1::bigint,
  'notification drift query reports pending notification outbox work'
);

select is(
  (select duplicate_delivery_keys from public.notification_delivery_drift('80000000-0000-0000-0000-000000000001')),
  0::bigint,
  'notification drift query reports no duplicate delivery keys'
);

select is(
  (select count(*) from public.notifications),
  1::bigint,
  'recipient sees only own notification through RLS'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is(
  (select count(*) from public.notifications),
  0::bigint,
  'foreign tenant user cannot see notification'
);

select throws_ok(
  $$
  insert into public.notifications (tenant_id, user_id, title, body, type, delivery_key)
  values (
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000003',
    'Foreign write',
    null,
    'system_event',
    'manual:foreign-write'
  );
  $$,
  '42501',
  'new row violates row-level security policy for table "notifications"',
  'foreign tenant user cannot mutate notification'
);

select * from finish();
rollback;
