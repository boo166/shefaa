begin;

select plan(12);

set local role postgres;
set local session_replication_role = replica;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);

truncate
  public.billing_reconciliation_findings,
  public.billing_reconciliation_runs,
  public.dead_letter_events,
  public.event_delivery_attempts,
  public.event_outbox,
  public.domain_events,
  public.system_logs,
  public.command_idempotency,
  public.audit_logs,
  public.invoice_payments,
  public.invoices,
  public.notifications,
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
  '51000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'cross-domain-dr@test.com',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('50000000-0000-0000-0000-000000000001', 'Cross Domain DR Tenant', 'cross-domain-dr-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Cross Domain DR User');

insert into public.user_roles (id, user_id, role)
values ('53000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('54000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'DR-PT-1', 'Cross Domain Patient', 'active');

insert into public.invoices (
  id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due, status, invoice_date
)
values (
  '55000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001',
  'INV-DR-1',
  'Consult',
  100,
  0,
  100,
  'pending',
  current_date
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.post_invoice_payment(
    '55000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    100,
    'cash',
    now(),
    'DR-R-1',
    'settlement',
    'dr-payment-key-1',
    '55000000-0000-0000-0000-000000000001|50000000-0000-0000-0000-000000000001|100|cash|paid-at|DR-R-1|settlement',
    '51000000-0000-0000-0000-000000000001',
    '56000000-0000-0000-0000-000000000001',
    'op-dr-payment',
    'wf-dr-payment'
  )),
  'OK',
  'billing payment command commits before replay scenario'
);

set local role postgres;

select is(
  (select status from public.invoices where id = '55000000-0000-0000-0000-000000000001'),
  'paid',
  'billing payment settles invoice state'
);

select is(
  (select count(*) from public.domain_events where event_type = 'InvoicePaid'),
  1::bigint,
  'billing payment creates one domain event before replay'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);

select ok(
  (select idempotency_replay from public.post_invoice_payment(
    '55000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    100,
    'cash',
    now(),
    'DR-R-1',
    'settlement',
    'dr-payment-key-1',
    '55000000-0000-0000-0000-000000000001|50000000-0000-0000-0000-000000000001|100|cash|paid-at|DR-R-1|settlement',
    '51000000-0000-0000-0000-000000000001',
    '56000000-0000-0000-0000-000000000001',
    'op-dr-payment',
    'wf-dr-payment'
  )),
  'billing payment replay is idempotent after crash recovery'
);

set local role postgres;

select is(
  (select count(*) from public.domain_events where event_type = 'InvoicePaid'),
  1::bigint,
  'billing payment replay does not duplicate domain events'
);

select is(
  (select count(*) from public.invoice_payments where invoice_id = '55000000-0000-0000-0000-000000000001'),
  1::bigint,
  'billing payment replay does not duplicate payment rows'
);

insert into public.domain_events (
  id, event_type, event_version, entity_type, entity_id, tenant_id, user_id, payload,
  request_trace_id, operation_trace_id, workflow_trace_id
)
values (
  '57000000-0000-0000-0000-000000000001',
  'InvoicePaid',
  1,
  'invoice',
  '55000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '{"invoiceId":"55000000-0000-0000-0000-000000000001"}'::jsonb,
  '56000000-0000-0000-0000-000000000010',
  'op-dr-notif',
  'wf-dr-notif'
);

select id as dr_notification_outbox_id
from public.event_outbox
where domain_event_id = '57000000-0000-0000-0000-000000000001'
  and handler_name = 'notifications'
\gset

select set_config('request.jwt.claim.role', 'service_role', true);

select is(
  (select count(*) from public.event_outbox_claim_batch(1, 'dr-worker')),
  1::bigint,
  'notification outbox worker claims pending delivery after simulated crash'
);

select public.event_outbox_mark_failed(
  :'dr_notification_outbox_id'::uuid,
  'dr-worker',
  'TRANSIENT_ERROR',
  'simulated delivery crash',
  15
);

select is(
  (select status from public.event_outbox where id = :'dr_notification_outbox_id'::uuid),
  'RETRY',
  'notification delivery failure moves outbox row to retry'
);

select is(
  (select count(*) from public.event_delivery_attempts where outbox_id = :'dr_notification_outbox_id'::uuid and status = 'FAILED'),
  1::bigint,
  'notification delivery attempt persists retry evidence'
);

update public.event_outbox
set attempts = max_attempts,
    status = 'PROCESSING',
    locked_by = 'dr-worker',
    locked_at = now()
where id = :'dr_notification_outbox_id'::uuid;

select public.event_outbox_mark_failed(
  :'dr_notification_outbox_id'::uuid,
  'dr-worker',
  'HANDLER_ERROR',
  'permanent notification handler failure',
  20
);

select is(
  (select status from public.event_outbox where id = :'dr_notification_outbox_id'::uuid),
  'DEAD_LETTER',
  'exhausted notification delivery lands in dead letter'
);

select is(
  (select count(*) from public.dead_letter_events where outbox_id = :'dr_notification_outbox_id'::uuid),
  1::bigint,
  'dead letter table retains notification outbox recovery evidence'
);

select * from finish();
rollback;
