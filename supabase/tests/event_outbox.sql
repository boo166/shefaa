begin;

select plan(9);

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
  public.jobs,
  public.notifications,
  public.audit_logs,
  public.user_global_roles,
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
    '41000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'event-tenant-admin@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000099',
    'authenticated',
    'authenticated',
    'event-super-admin@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('40000000-0000-0000-0000-000000000001', 'Event Tenant', 'event-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values
  ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Event Tenant Admin'),
  ('42000000-0000-0000-0000-000000000099', '41000000-0000-0000-0000-000000000099', null, 'Event Super Admin');

insert into public.user_roles (id, user_id, role)
values ('43000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.user_global_roles (id, user_id, role)
values ('43000000-0000-0000-0000-000000000099', '41000000-0000-0000-0000-000000000099', 'super_admin');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

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
  '44000000-0000-0000-0000-000000000001',
  'InvoicePaid',
  1,
  'invoice',
  '45000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '{"invoiceId":"45000000-0000-0000-0000-000000000001","amount":100}'::jsonb,
  '46000000-0000-0000-0000-000000000001',
  'op-event-test',
  'wf-event-test'
);

select is(
  (select count(*) from public.event_outbox where domain_event_id = '44000000-0000-0000-0000-000000000001'),
  3::bigint,
  'domain event insert creates handler-specific outbox rows'
);

select is(
  (select count(*) from public.event_outbox where handler_name = 'audit' and delivery_guarantee = 'exactly_once_persistence'),
  1::bigint,
  'audit handler is marked exactly-once persistence'
);

select throws_ok(
  $$select * from public.event_outbox_claim_batch(10, 'test-worker')$$,
  '42501',
  null,
  'authenticated tenant users cannot claim outbox work'
);

set local role postgres;
select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select count(*) from public.event_outbox_claim_batch(2, 'test-worker')),
  2::bigint,
  'worker claims ready rows with service role context'
);

select is(
  (select count(*) from public.event_outbox where status = 'PROCESSING' and attempts = 1 and locked_by = 'test-worker'),
  2::bigint,
  'claimed rows are locked and attempt-counted'
);

select public.event_outbox_mark_failed(
  (select id from public.event_outbox where status = 'PROCESSING' order by created_at limit 1),
  'test-worker',
  'TRANSIENT_ERROR',
  'temporary failure',
  15
);

select is(
  (select count(*) from public.event_outbox where status = 'RETRY' and last_error_code = 'TRANSIENT_ERROR'),
  1::bigint,
  'failed non-exhausted delivery moves to retry'
);

select is(
  (select count(*) from public.event_delivery_attempts where status = 'FAILED' and error_code = 'TRANSIENT_ERROR'),
  1::bigint,
  'delivery attempts persist failure evidence'
);

update public.event_outbox
set attempts = max_attempts,
    status = 'PROCESSING'
where id = (
  select id
  from public.event_outbox
  where status = 'PROCESSING'
  order by created_at
  limit 1
);

select public.event_outbox_mark_failed(
  (select id from public.event_outbox where status = 'PROCESSING' order by created_at limit 1),
  'test-worker',
  'HANDLER_ERROR',
  'permanent failure',
  20
);

select is(
  (select count(*) from public.dead_letter_events where last_error_code = 'HANDLER_ERROR'),
  1::bigint,
  'exhausted delivery is copied to dead-letter evidence'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000099', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"41000000-0000-0000-0000-000000000099","role":"authenticated"}', true);

select is(
  (select dead_letter_count from public.admin_event_outbox_summary('40000000-0000-0000-0000-000000000001')),
  1::bigint,
  'super admins can read tenant-scoped outbox summary'
);

select * from finish();
rollback;
