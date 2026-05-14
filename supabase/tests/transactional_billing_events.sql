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
  public.system_logs,
  public.command_idempotency,
  public.invoice_payments,
  public.invoices,
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
  'billing-command@test.com',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('50000000-0000-0000-0000-000000000001', 'Billing Command Tenant', 'billing-command-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Billing Command User');

insert into public.user_roles (id, user_id, role)
values ('53000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('54000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'PT-CMD-1', 'Billing Patient', 'active');

insert into public.invoices (
  id,
  tenant_id,
  patient_id,
  invoice_code,
  service,
  amount,
  amount_paid,
  balance_due,
  status,
  invoice_date
)
values (
  '55000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001',
  'INV-CMD-1',
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
    'R-1',
    'settlement',
    'cmd-key-1',
    '55000000-0000-0000-0000-000000000001|50000000-0000-0000-0000-000000000001|100|cash|paid-at|R-1|settlement',
    '51000000-0000-0000-0000-000000000001',
    'req-cmd-1',
    'op-cmd-1',
    'wf-cmd-1'
  )),
  'OK',
  'payment command commits successfully'
);

set local role postgres;

select is(
  (select status from public.invoices where id = '55000000-0000-0000-0000-000000000001'),
  'paid',
  'financial state is settled by the command'
);

select is(
  (select count(*) from public.domain_events where event_type = 'InvoicePaid' and entity_id = '55000000-0000-0000-0000-000000000001'),
  1::bigint,
  'payment command creates InvoicePaid domain event in the same transaction'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'InvoicePaid' and aggregate_id = '55000000-0000-0000-0000-000000000001'),
  3::bigint,
  'domain event trigger creates durable outbox rows in the same transaction'
);

select ok(
  exists (
    select 1
    from public.command_idempotency
    where idempotency_key = 'cmd-key-1'
      and status = 'committed'
      and response_payload ? 'domain_event_id'
  ),
  'idempotency record stores committed event identity'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'invoice_payment_posted'
      and details->>'domain_event_id' is not null
      and details->>'workflow_trace_id' = 'wf-cmd-1'
  ),
  'payment audit evidence is written atomically with trace ids'
);

select ok(
  exists (
    select 1
    from public.system_logs
    where service = 'billing-transactional-command'
      and message = 'transactional_command.duration'
      and metadata->>'domain_event_id' is not null
  ),
  'transactional command duration metric is recorded'
);

select is(
  (select count(*) from public.domain_events),
  1::bigint,
  'baseline has one domain event before replay'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.domain_events)
  +
  (select count(*) from public.post_invoice_payment(
    '55000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000001',
    100,
    'cash',
    now(),
    'R-1',
    'settlement',
    'cmd-key-1',
    '55000000-0000-0000-0000-000000000001|50000000-0000-0000-0000-000000000001|100|cash|paid-at|R-1|settlement',
    '51000000-0000-0000-0000-000000000001',
    'req-cmd-1',
    'op-cmd-1',
    'wf-cmd-1'
  ))
  -
  (select count(*) from public.domain_events),
  1::bigint,
  'idempotency replay returns one response without creating another domain event'
);

select * from finish();
rollback;
