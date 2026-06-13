begin;

select plan(12);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.invoice_refunds,
  public.command_idempotency,
  public.audit_logs,
  public.domain_events,
  public.event_outbox,
  public.invoice_payments,
  public.invoices,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'billing-postpay@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('60000000-0000-0000-0000-000000000001', 'Post Payment Tenant', 'post-payment-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Billing Admin');

insert into public.user_roles (id, user_id, role)
values ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('64000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'PT-PP-1', 'Post Pay Patient', 'active');

insert into public.invoices (id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due, status, invoice_date)
values ('65000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001', 'INV-PP-1', 'Surgery', 200, 0, 200, 'pending', current_date);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select result_code from public.post_invoice_payment(
  '65000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 200, 'cash',
  now(), null, null, 'pay-full-1', 'hash-pay-full-1', '61000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001', 'op-pay', 'wf-billing-pp'
)), 'OK', 'full payment posts successfully');

select is((select status from public.invoices where id = '65000000-0000-0000-0000-000000000001'), 'paid', 'invoice becomes paid');

select is((select result_code from public.command_invoice_refund(
  '65000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 50, 'Partial refund',
  'REF-1', 'refund-1', 'hash-refund-1', '61000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002', 'op-refund', 'wf-billing-pp'
)), 'OK', 'partial refund command succeeds');

select is((select amount_paid from public.invoices where id = '65000000-0000-0000-0000-000000000001'), 150::numeric, 'refund reduces amount_paid');

select ok((select idempotency_replay from public.command_invoice_refund(
  '65000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 50, 'Partial refund',
  'REF-1', 'refund-1', 'hash-refund-1', '61000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002', 'op-refund', 'wf-billing-pp'
)), 'refund replays idempotently');

select throws_ok(
  $$select * from public.command_invoice_refund(
    '65000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 500, 'Over refund',
    null, 'refund-over', 'hash-over', '61000000-0000-0000-0000-000000000001', null, null, null
  );$$,
  'Refund amount exceeds paid amount',
  'refund rejects amount over paid balance'
);

select is((select result_code from public.command_invoice_payment_reversal(
  (select id from public.invoice_payments where invoice_id = '65000000-0000-0000-0000-000000000001' limit 1),
  '60000000-0000-0000-0000-000000000001', 'Chargeback reversal', 'rev-1', 'hash-rev-1',
  '61000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000003', 'op-reversal', 'wf-billing-pp'
)), 'OK', 'payment reversal command succeeds');

select ok(exists (
  select 1 from public.audit_logs where action = 'invoice_payment_reversed'
    and details->>'workflowTraceId' = 'wf-billing-pp'
), 'reversal writes audit evidence with trace ids');

insert into public.invoices (id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due, status, invoice_date, due_date)
values ('65000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000001', 'INV-PP-2', 'Uncollectible', 80, 0, 80, 'overdue', current_date, current_date - 30);

select is((select result_code from public.command_invoice_write_off(
  '65000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'Bad debt write-off',
  'wo-1', 'hash-wo-1', '61000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000004', 'op-writeoff', 'wf-billing-pp'
)), 'OK', 'write-off command succeeds');

select is((select status from public.invoices where id = '65000000-0000-0000-0000-000000000002'), 'written_off', 'invoice becomes written_off');

select ok(exists (
  select 1 from public.domain_events where event_type = 'InvoiceRefunded' and tenant_id = '60000000-0000-0000-0000-000000000001'
), 'refund emits domain event');

select ok(exists (
  select 1 from public.event_outbox where domain_event_id in (
    select id from public.domain_events where event_type = 'InvoiceRefunded'
  )
), 'refund domain event creates outbox rows');

select * from finish();
rollback;
