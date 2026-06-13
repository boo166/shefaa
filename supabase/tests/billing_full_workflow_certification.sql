begin;

select plan(14);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.billing_reconciliation_findings,
  public.billing_reconciliation_runs,
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
values ('00000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000020', 'authenticated', 'authenticated', 'billing-fullwf@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('60000000-0000-0000-0000-000000000020', 'Full Workflow Tenant', 'full-workflow-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('62000000-0000-0000-0000-000000000020', '61000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000020', 'Billing Admin');

insert into public.user_roles (id, user_id, role)
values ('63000000-0000-0000-0000-000000000020', '61000000-0000-0000-0000-000000000020', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('64000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000020', 'PT-FW-1', 'Full Workflow Patient', 'active');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000020', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000020","role":"authenticated"}', true);

-- Create Invoice
select is((select result_code from public.command_invoice_lifecycle(
  'create', null, '60000000-0000-0000-0000-000000000020',
  jsonb_build_object(
    'patient_id', '64000000-0000-0000-0000-000000000020',
    'invoice_code', 'INV-FW-1',
    'service', 'Surgery Package',
    'amount', 500
  ),
  null, 'fw-create', 'hash-fw-create', '61000000-0000-0000-0000-000000000020',
  '70000000-0000-0000-0000-000000000020', 'op-create', 'wf-billing-full'
)), 'OK', 'step 1: create invoice');

-- Partial Payment 1
select is((select result_code from public.post_invoice_payment(
  (select id from public.invoices where invoice_code = 'INV-FW-1'),
  '60000000-0000-0000-0000-000000000020', 150, 'cash',
  now(), 'RCPT-1', null, 'fw-pay-1', 'hash-fw-pay-1', '61000000-0000-0000-0000-000000000020',
  '70000000-0000-0000-0000-000000000021', 'op-pay1', 'wf-billing-full'
)), 'OK', 'step 2: first partial payment');

select is(
  (select status from public.invoices where invoice_code = 'INV-FW-1'),
  'partially_paid',
  'invoice is partially paid after first payment'
);

-- Partial Payment 2
select is((select result_code from public.post_invoice_payment(
  (select id from public.invoices where invoice_code = 'INV-FW-1'),
  '60000000-0000-0000-0000-000000000020', 200, 'card',
  now(), 'RCPT-2', null, 'fw-pay-2', 'hash-fw-pay-2', '61000000-0000-0000-0000-000000000020',
  '70000000-0000-0000-0000-000000000022', 'op-pay2', 'wf-billing-full'
)), 'OK', 'step 3: second partial payment');

select is(
  (select amount_paid::numeric from public.invoices where invoice_code = 'INV-FW-1'),
  350::numeric,
  'amount_paid reflects both partial payments'
);

-- Refund
select is((select result_code from public.command_invoice_refund(
  (select id from public.invoices where invoice_code = 'INV-FW-1'),
  '60000000-0000-0000-0000-000000000020', 50, 'Partial refund for overcharge',
  'REF-FW-1', 'fw-refund-1', 'hash-fw-refund-1', '61000000-0000-0000-0000-000000000020',
  '70000000-0000-0000-0000-000000000023', 'op-refund', 'wf-billing-full'
)), 'OK', 'step 4: partial refund');

select ok(exists (
  select 1 from public.audit_logs where action = 'invoice_refunded'
    and details->>'workflowTraceId' = 'wf-billing-full'
), 'refund writes audit with workflow trace');

-- Reversal
select is((select result_code from public.command_invoice_payment_reversal(
  (select id from public.invoice_payments where invoice_id = (select id from public.invoices where invoice_code = 'INV-FW-1') order by created_at limit 1),
  '60000000-0000-0000-0000-000000000020', 'Chargeback on first payment', 'fw-rev-1', 'hash-fw-rev-1',
  '61000000-0000-0000-0000-000000000020', '70000000-0000-0000-0000-000000000024', 'op-reversal', 'wf-billing-full'
)), 'OK', 'step 5: payment reversal');

select ok(exists (
  select 1 from public.domain_events where event_type in ('InvoiceRefunded', 'PaymentReversed')
    and tenant_id = '60000000-0000-0000-0000-000000000020'
), 'refund and reversal emit domain events');

select ok(exists (
  select 1 from public.event_outbox eo
  inner join public.domain_events de on de.id = eo.domain_event_id
  where de.tenant_id = '60000000-0000-0000-0000-000000000020'
), 'domain events materialize outbox rows');

-- Write Off (separate overdue invoice)
insert into public.invoices (id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due, status, invoice_date, due_date)
values ('65000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000020', '64000000-0000-0000-0000-000000000020', 'INV-FW-2', 'Uncollectible', 120, 0, 120, 'overdue', current_date, current_date - 60);

select is((select result_code from public.command_invoice_write_off(
  '65000000-0000-0000-0000-000000000020', '60000000-0000-0000-0000-000000000020', 'Bad debt after 60 days',
  'fw-wo-1', 'hash-fw-wo-1', '61000000-0000-0000-0000-000000000020',
  '70000000-0000-0000-0000-000000000025', 'op-writeoff', 'wf-billing-full'
)), 'OK', 'step 6: write off overdue invoice');

select is(
  (select status from public.invoices where invoice_code = 'INV-FW-2'),
  'written_off',
  'write-off sets written_off status'
);

-- Reconciliation clean
select is(
  (select critical_count from public.run_billing_reconciliation(
    '60000000-0000-0000-0000-000000000020',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  )),
  0::bigint,
  'reconciliation returns zero critical findings after full workflow'
);

select ok(
  (select count(*) from public.audit_logs where details->>'workflowTraceId' = 'wf-billing-full') >= 3,
  'multiple audit entries share workflow trace id'
);

select * from finish();
rollback;
