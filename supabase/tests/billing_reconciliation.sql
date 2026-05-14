begin;

select plan(16);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.billing_reconciliation_findings,
  public.billing_reconciliation_runs,
  public.command_idempotency,
  public.invoice_payments,
  public.invoices,
  public.feature_flags,
  public.subscriptions,
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
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000011',
    'authenticated',
    'authenticated',
    'billing-recon-one@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000022',
    'authenticated',
    'authenticated',
    'billing-recon-two@test.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
on conflict (id) do nothing;

insert into public.tenants (id, name, slug)
values
  ('00000000-0000-0000-0000-000000000011', 'Tenant One', 'tenant-one'),
  ('00000000-0000-0000-0000-000000000022', 'Tenant Two', 'tenant-two');

insert into public.profiles (id, user_id, tenant_id, full_name)
values
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000011', 'User One'),
  ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000022', 'User Two');

insert into public.user_roles (id, user_id, role)
values
  ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000011', 'clinic_admin'),
  ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000022', 'clinic_admin');

insert into public.subscriptions (tenant_id, plan, status, amount, currency, billing_cycle, started_at)
values
  ('00000000-0000-0000-0000-000000000011', 'enterprise', 'active', 500, 'EGP', 'monthly', now()),
  ('00000000-0000-0000-0000-000000000022', 'enterprise', 'active', 500, 'EGP', 'monthly', now());

insert into public.feature_flags (tenant_id, feature_key, enabled)
values
  ('00000000-0000-0000-0000-000000000011', 'billing', true),
  ('00000000-0000-0000-0000-000000000022', 'billing', true);

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values
  ('00000000-0000-0000-0000-000000001111', '00000000-0000-0000-0000-000000000011', 'PT-1001', 'Patient One', 'active'),
  ('00000000-0000-0000-0000-000000002222', '00000000-0000-0000-0000-000000000022', 'PT-2001', 'Patient Two', 'active');

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
values
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000001111',
    'INV-RECON-A',
    'Consult',
    100,
    100,
    0,
    'paid',
    current_date
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000002222',
    'INV-RECON-B',
    'Consult',
    200,
    0,
    200,
    'pending',
    current_date
  );

insert into public.invoice_payments (
  id,
  tenant_id,
  invoice_id,
  patient_id,
  amount,
  payment_method,
  paid_at,
  created_by
)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000001111',
  100,
  'cash',
  now(),
  '00000000-0000-0000-0000-000000000011'
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select finding_count from public.run_billing_reconciliation(
    '00000000-0000-0000-0000-000000000011',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  )),
  0::bigint,
  'Clean tenant returns zero billing reconciliation findings'
);

set local role postgres;
update public.invoices
set amount_paid = 80
where id = '00000000-0000-0000-0000-000000000401';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);
select is(
  (select count(*) from public.billing_reconciliation_findings),
  0::bigint,
  'No persisted findings are written by dry-run setup'
);

select is(
  (select critical_count from public.run_billing_reconciliation(
    '00000000-0000-0000-0000-000000000011',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  )),
  2::bigint,
  'Invoice payment total and invalid balance mismatches are critical'
);

set local role postgres;
update public.invoices
set
  amount_paid = 100,
  balance_due = 0,
  status = 'pending'
where id = '00000000-0000-0000-0000-000000000401';

insert into public.command_idempotency (
  id,
  tenant_id,
  operation_type,
  idempotency_key,
  request_hash,
  status,
  updated_at,
  request_trace_id,
  operation_trace_id,
  workflow_trace_id
)
values (
  '00000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000011',
  'invoice_payment_post',
  'stale-key-1',
  'hash',
  'started',
  now() - interval '30 minutes',
  'req-recon',
  'op-recon',
  'wf-recon'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);

select is(
  (select finding_count from public.run_billing_reconciliation(
    '00000000-0000-0000-0000-000000000011',
    now() - interval '1 day',
    now() + interval '1 day',
    false
  )),
  2::bigint,
  'Status mismatch and stale started idempotency key are recorded'
);

select ok(
  exists (
    select 1
    from public.billing_reconciliation_findings
    where finding_code = 'IDEMPOTENCY_KEY_STALE_STARTED'
      and request_trace_id = 'req-recon'
      and operation_trace_id = 'op-recon'
      and workflow_trace_id = 'wf-recon'
  ),
  'Reconciliation findings carry available trace ids'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.billing_reconciliation_findings'::regclass
      and c.conname = 'billing_reconciliation_findings_status_check'
      and pg_get_constraintdef(c.oid) like '%OPEN%'
      and pg_get_constraintdef(c.oid) like '%ACKNOWLEDGED%'
      and pg_get_constraintdef(c.oid) like '%INVESTIGATING%'
      and pg_get_constraintdef(c.oid) like '%RESOLVED%'
      and pg_get_constraintdef(c.oid) like '%FALSE_POSITIVE%'
  ),
  'Reconciliation finding lifecycle states are constrained to the operational workflow'
);

set local role postgres;

select is(
  (select command from cron.job where jobname = 'billing-reconciliation-hot'),
  $$select public.run_scheduled_billing_reconciliation('hot', interval '30 days', 25, interval '15 minutes');$$,
  'Hot tenant reconciliation runs every 15 minutes with bounded tenant concurrency'
);

select is(
  (select command from cron.job where jobname = 'billing-reconciliation-hourly'),
  $$select public.run_scheduled_billing_reconciliation('all', interval '30 days', 100, interval '45 minutes');$$,
  'All tenant reconciliation runs hourly with a minimum interval guard'
);

select is(
  (select command from cron.job where jobname = 'billing-reconciliation-full-daily'),
  $$select public.run_scheduled_billing_reconciliation('full', interval '3650 days', 500, interval '20 hours');$$,
  'Daily full reconciliation keeps a full-history window and bounded concurrency'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.run_scheduled_billing_reconciliation(text, interval, integer, interval)',
    'EXECUTE'
  ),
  false,
  'Authenticated users cannot execute the scheduled reconciliation wrapper'
);

select is(
  has_function_privilege(
    'service_role',
    'public.run_scheduled_billing_reconciliation(text, interval, integer, interval)',
    'EXECUTE'
  ),
  true,
  'Service role can execute the scheduled reconciliation wrapper'
);

select is(
  (
    select count(*)
    from public.run_scheduled_billing_reconciliation('all', interval '1 day', 1, interval '0 seconds')
  ),
  1::bigint,
  'Scheduled reconciliation respects the tenant limit'
);

select is(
  (
    select result
    from public.run_scheduled_billing_reconciliation('all', interval '1 day', 1, interval '1 day')
    where tenant_id = '00000000-0000-0000-0000-000000000011'
  ),
  'minimum_interval',
  'Scheduled reconciliation skips tenants inside the minimum completed-run interval'
);

insert into public.billing_reconciliation_runs (
  id,
  tenant_id,
  window_start,
  window_end,
  status,
  completed_at
)
values (
  '00000000-0000-0000-0000-000000000701',
  '00000000-0000-0000-0000-000000000011',
  now() - interval '1 day',
  now(),
  'failed',
  now() + interval '1 second'
);

select is(
  (
    select result
    from public.run_scheduled_billing_reconciliation('all', interval '1 day', 1, interval '1 day')
    where tenant_id = '00000000-0000-0000-0000-000000000011'
  ),
  'recent_failure',
  'Scheduled reconciliation detects recent failed runs instead of thrashing the tenant'
);

set local role postgres;
select throws_ok(
  $$ insert into public.invoice_payments (
    id,
    tenant_id,
    invoice_id,
    patient_id,
    amount,
    payment_method,
    paid_at
  )
  values (
    '00000000-0000-0000-0000-000000000502',
    '00000000-0000-0000-0000-000000000022',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000002222',
    10,
    'cash',
    now()
  ); $$,
  '23503',
  'insert or update on table "invoice_payments" violates foreign key constraint "invoice_payments_invoice_tenant_fk"',
  'Cross-tenant invoice payments are blocked by the composite tenant foreign key'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', true);

select throws_ok(
  $$ select * from public.run_billing_reconciliation(
    '00000000-0000-0000-0000-000000000022',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  ); $$,
  '42501',
  'Tenant mismatch for billing reconciliation',
  'Billing reconciliation rejects explicit cross-tenant scope'
);

select * from finish();
rollback;
