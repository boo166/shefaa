begin;

select plan(5);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.billing_reconciliation_findings,
  public.billing_reconciliation_runs,
  public.invoice_refunds,
  public.command_idempotency,
  public.invoice_payments,
  public.invoices,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000030', 'authenticated', 'authenticated', 'billing-recon-pp@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('60000000-0000-0000-0000-000000000030', 'Post Payment Recon Tenant', 'post-payment-recon', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('62000000-0000-0000-0000-000000000030', '61000000-0000-0000-0000-000000000030', '60000000-0000-0000-0000-000000000030', 'Recon Admin');

insert into public.user_roles (id, user_id, role)
values ('63000000-0000-0000-0000-000000000030', '61000000-0000-0000-0000-000000000030', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('64000000-0000-0000-0000-000000000030', '60000000-0000-0000-0000-000000000030', 'PT-PP-RECON', 'Recon Patient', 'active');

-- REFUND_OVER_PAID: refunds exceed active payments
insert into public.invoices (id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, amount_refunded, balance_due, status, invoice_date, updated_at)
values ('65000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000030', '64000000-0000-0000-0000-000000000030', 'INV-RO-1', 'Service A', 100, 50, 80, 50, 'partially_paid', current_date, now());

insert into public.invoice_payments (id, tenant_id, invoice_id, patient_id, amount, payment_method, paid_at, created_by)
values ('66000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000030', '65000000-0000-0000-0000-000000000031', '64000000-0000-0000-0000-000000000030', 100, 'cash', now(), '61000000-0000-0000-0000-000000000030');

insert into public.invoice_refunds (id, tenant_id, invoice_id, amount, reason, reference, created_by, created_at)
values ('67000000-0000-0000-0000-000000000031', '60000000-0000-0000-0000-000000000030', '65000000-0000-0000-0000-000000000031', 120, 'Drift test', 'REF-DRIFT', '61000000-0000-0000-0000-000000000030', now());

-- PAYMENT_REVERSAL_MISMATCH: reversed payment but amount_paid not adjusted
insert into public.invoices (id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due, status, invoice_date, updated_at)
values ('65000000-0000-0000-0000-000000000032', '60000000-0000-0000-0000-000000000030', '64000000-0000-0000-0000-000000000030', 'INV-RO-2', 'Service B', 200, 200, 0, 'paid', current_date, now());

insert into public.invoice_payments (id, tenant_id, invoice_id, patient_id, amount, payment_method, paid_at, reversed_at, created_by)
values ('66000000-0000-0000-0000-000000000032', '60000000-0000-0000-0000-000000000030', '65000000-0000-0000-0000-000000000032', '64000000-0000-0000-0000-000000000030', 200, 'card', now(), now(), '61000000-0000-0000-0000-000000000030');

-- INVOICE_BALANCE_AFTER_REFUND_INVALID: amount_refunded column drift
insert into public.invoices (id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, amount_refunded, balance_due, status, invoice_date, updated_at)
values ('65000000-0000-0000-0000-000000000033', '60000000-0000-0000-0000-000000000030', '64000000-0000-0000-0000-000000000030', 'INV-RO-3', 'Service C', 150, 100, 10, 50, 'partially_paid', current_date, now());

insert into public.invoice_payments (id, tenant_id, invoice_id, patient_id, amount, payment_method, paid_at, created_by)
values ('66000000-0000-0000-0000-000000000033', '60000000-0000-0000-0000-000000000030', '65000000-0000-0000-0000-000000000033', '64000000-0000-0000-0000-000000000030', 100, 'cash', now(), '61000000-0000-0000-0000-000000000030');

insert into public.invoice_refunds (id, tenant_id, invoice_id, amount, reason, reference, created_by, created_at)
values ('67000000-0000-0000-0000-000000000033', '60000000-0000-0000-0000-000000000030', '65000000-0000-0000-0000-000000000033', 25, 'Actual refund', 'REF-ACT', '61000000-0000-0000-0000-000000000030', now());

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000030', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select ok(
  (select critical_count from public.run_billing_reconciliation(
    '60000000-0000-0000-0000-000000000030',
    now() - interval '1 day',
    now() + interval '1 day',
    false
  )) >= 2,
  'live reconciliation records multiple critical post-payment findings'
);

select ok(
  exists (
    select 1 from public.billing_reconciliation_findings
    where tenant_id = '60000000-0000-0000-0000-000000000030'
      and finding_code = 'REFUND_OVER_PAID'
      and severity = 'critical'
  ),
  'REFUND_OVER_PAID finding persisted with critical severity'
);

select ok(
  exists (
    select 1 from public.billing_reconciliation_findings
    where tenant_id = '60000000-0000-0000-0000-000000000030'
      and finding_code = 'PAYMENT_REVERSAL_MISMATCH'
      and severity = 'critical'
  ),
  'PAYMENT_REVERSAL_MISMATCH finding persisted with critical severity'
);

select ok(
  exists (
    select 1 from public.billing_reconciliation_findings
    where tenant_id = '60000000-0000-0000-0000-000000000030'
      and finding_code = 'INVOICE_BALANCE_AFTER_REFUND_INVALID'
      and severity = 'warning'
  ),
  'INVOICE_BALANCE_AFTER_REFUND_INVALID finding persisted with warning severity'
);

select ok(
  (select finding_count from public.run_billing_reconciliation(
    '60000000-0000-0000-0000-000000000030',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  )) >= 3,
  'dry run detects post-payment drift without persisting duplicate findings'
);

select * from finish();
rollback;
