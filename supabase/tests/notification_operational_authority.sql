begin;

select plan(33);

set local role postgres;
set local session_replication_role = replica;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);

truncate
  public.notification_reconciliation_findings,
  public.notification_reconciliation_runs,
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

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_notification_delivery(
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'Invoice emails sent',
    'Sent 3, failed 0, skipped 1.',
    'billing_email_job',
    'billing-email-job:80000000-0000-0000-0000-000000000001:88000000-0000-0000-0000-000000000001:81000000-0000-0000-0000-000000000002',
    null,
    null,
    false,
    'billing-email-job:80000000-0000-0000-0000-000000000001:88000000-0000-0000-0000-000000000001:81000000-0000-0000-0000-000000000002',
    '{"type":"billing_email_job","sent":3,"failed":0,"skipped":1}',
    '81000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000001',
    'send-invoice-emails',
    'billing-email-delivery'
  )),
  'OK',
  'invoice-email style delivery uses deterministic billing-email-job key'
);

select ok(
  (select idempotency_replay from public.command_notification_delivery(
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'Invoice emails sent',
    'Sent 3, failed 0, skipped 1.',
    'billing_email_job',
    'billing-email-job:80000000-0000-0000-0000-000000000001:88000000-0000-0000-0000-000000000001:81000000-0000-0000-0000-000000000002',
    null,
    null,
    false,
    'billing-email-job:80000000-0000-0000-0000-000000000001:88000000-0000-0000-0000-000000000001:81000000-0000-0000-0000-000000000002',
    '{"type":"billing_email_job","sent":3,"failed":0,"skipped":1}',
    '81000000-0000-0000-0000-000000000001',
    '88000000-0000-0000-0000-000000000001',
    'send-invoice-emails',
    'billing-email-delivery'
  )),
  'invoice-email style delivery replays idempotently by deterministic key'
);

select is(
  (select result_code from public.command_notification_delivery(
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'Upcoming Appointment Reminder',
    'Appointment with patient starts in 30 minutes.',
    'appointment_reminder',
    'appointment-reminder:80000000-0000-0000-0000-000000000001:85000000-0000-0000-0000-000000000001:81000000-0000-0000-0000-000000000002:in_app',
    null,
    null,
    false,
    'appointment-reminder:80000000-0000-0000-0000-000000000001:85000000-0000-0000-0000-000000000001:81000000-0000-0000-0000-000000000002:in_app',
    '{"type":"appointment_reminder","appointment_id":"85000000-0000-0000-0000-000000000001","user_id":"81000000-0000-0000-0000-000000000002","channel":"in_app"}',
    '81000000-0000-0000-0000-000000000002',
    '88000000-0000-0000-0000-000000000002',
    'appointment-reminders',
    'appointment-reminder-delivery'
  )),
  'OK',
  'appointment-reminder style delivery uses deterministic in_app key'
);

select ok(
  (select idempotency_replay from public.command_notification_delivery(
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'Upcoming Appointment Reminder',
    'Appointment with patient starts in 30 minutes.',
    'appointment_reminder',
    'appointment-reminder:80000000-0000-0000-0000-000000000001:85000000-0000-0000-0000-000000000001:81000000-0000-0000-0000-000000000002:in_app',
    null,
    null,
    false,
    'appointment-reminder:80000000-0000-0000-0000-000000000001:85000000-0000-0000-0000-000000000001:81000000-0000-0000-0000-000000000002:in_app',
    '{"type":"appointment_reminder","appointment_id":"85000000-0000-0000-0000-000000000001","user_id":"81000000-0000-0000-0000-000000000002","channel":"in_app"}',
    '81000000-0000-0000-0000-000000000002',
    '88000000-0000-0000-0000-000000000002',
    'appointment-reminders',
    'appointment-reminder-delivery'
  )),
  'appointment-reminder style delivery replays idempotently by deterministic key'
);

set local role postgres;

insert into public.notifications (
  id, tenant_id, user_id, title, body, type, read, delivery_key, created_at, updated_at
)
values (
  '89000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  'Manual bypass',
  'Inserted without command evidence',
  'system_event',
  false,
  'manual:bypass-evidence',
  now(),
  now()
);

set local session_replication_role = replica;

insert into public.notifications (
  id, tenant_id, user_id, title, body, type, read, delivery_key,
  source_outbox_id, created_at, updated_at
)
values (
  '89000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  'Orphan source',
  'Missing source outbox row',
  'system_event',
  false,
  'manual:orphan-source',
  '87000000-0000-0000-0000-000000000099',
  now(),
  now()
);

set local session_replication_role = origin;

insert into public.notifications (
  id, tenant_id, user_id, title, body, type, read, delivery_key, created_at, updated_at
)
values (
  '89000000-0000-0000-0000-000000000003',
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000002',
  'Inconsistent ack',
  'Read without acknowledged_at',
  'system_event',
  true,
  'manual:inconsistent-ack',
  now(),
  now()
);

insert into public.event_outbox (
  id,
  tenant_id,
  domain_event_id,
  handler_name,
  event_type,
  aggregate_type,
  payload,
  status,
  attempts,
  processed_at,
  created_at,
  updated_at
)
values (
  '87000000-0000-0000-0000-000000000010',
  '80000000-0000-0000-0000-000000000001',
  null,
  'notifications',
  'AppointmentLifecycleTransitioned',
  'appointment',
  '{}'::jsonb,
  'DELIVERED',
  1,
  now(),
  now(),
  now()
);

insert into public.event_outbox (
  id,
  tenant_id,
  domain_event_id,
  handler_name,
  event_type,
  aggregate_type,
  payload,
  status,
  attempts,
  next_retry_at,
  created_at,
  updated_at
)
values (
  '87000000-0000-0000-0000-000000000011',
  '80000000-0000-0000-0000-000000000001',
  null,
  'notifications',
  'AppointmentLifecycleTransitioned',
  'appointment',
  '{}'::jsonb,
  'RETRY',
  3,
  now() - interval '30 minutes',
  now() - interval '2 hours',
  now() - interval '2 hours'
);

drop index if exists public.ux_notifications_tenant_delivery_key;

insert into public.notifications (
  id, tenant_id, user_id, title, body, type, read, delivery_key, created_at, updated_at
)
values
  (
    '89000000-0000-0000-0000-000000000004',
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'Duplicate one',
    null,
    'system_event',
    false,
    'manual:duplicate-key',
    now(),
    now()
  ),
  (
    '89000000-0000-0000-0000-000000000005',
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000002',
    'Duplicate two',
    null,
    'system_event',
    false,
    'manual:duplicate-key',
    now(),
    now()
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select ok(
  (select finding_count >= 5 from public.run_notification_reconciliation(
    '80000000-0000-0000-0000-000000000001',
    now() - interval '24 hours',
    now() + interval '1 hour',
    false,
    '86000000-0000-0000-0000-000000000010',
    'op-notification-reconcile',
    'wf-notification-reconcile'
  )),
  'notification reconciliation persists findings for drift scenarios'
);

select ok(
  exists (
    select 1
    from public.notification_reconciliation_findings
    where finding_code = 'notification_missing_command_evidence'
      and notification_id = '89000000-0000-0000-0000-000000000001'
  ),
  'reconciliation detects direct notification without command evidence'
);

select ok(
  exists (
    select 1
    from public.notification_reconciliation_findings
    where finding_code = 'delivered_outbox_without_notification'
      and outbox_id = '87000000-0000-0000-0000-000000000010'
  ),
  'reconciliation detects delivered outbox without matching notification'
);

select ok(
  exists (
    select 1
    from public.notification_reconciliation_findings
    where finding_code = 'notification_missing_source_outbox'
      and notification_id = '89000000-0000-0000-0000-000000000002'
  ),
  'reconciliation detects notification with missing source outbox'
);

select ok(
  exists (
    select 1
    from public.notification_reconciliation_findings
    where finding_code = 'duplicate_notification_delivery_key'
      and evidence->>'delivery_key' = 'manual:duplicate-key'
  ),
  'reconciliation detects duplicate delivery key drift'
);

select ok(
  exists (
    select 1
    from public.notification_reconciliation_findings
    where finding_code = 'notification_acknowledgement_inconsistent'
      and notification_id = '89000000-0000-0000-0000-000000000003'
  ),
  'reconciliation detects read=true without acknowledged_at'
);

select ok(
  exists (
    select 1
    from public.notification_reconciliation_findings
    where finding_code = 'pending_notification_outbox_past_sla'
      and outbox_id = '87000000-0000-0000-0000-000000000011'
  ),
  'reconciliation detects notification outbox retry work past SLA'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'notification_reconciliation_run'
      and details->>'request_trace_id' = '86000000-0000-0000-0000-000000000010'
      and details->>'workflow_trace_id' = 'wf-notification-reconcile'
  ),
  'reconciliation run writes audit evidence with trace ids'
);

select is(
  (select duplicate_delivery_keys from public.notification_delivery_drift('80000000-0000-0000-0000-000000000001')),
  1::bigint,
  'notification drift query reports duplicate delivery keys after corruption'
);

select * from finish();
rollback;
