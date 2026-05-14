\if :{?rls_suite}
set local role authenticated;
set local row_security = on;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.invoices where id = '38000000-0000-0000-0000-000000000001'),
  1::bigint,
  'billing RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=own invoice visible path=invoices.select.own'
);

select is(
  (select count(*) from public.invoices where id = '38000000-0000-0000-0000-000000000002'),
  0::bigint,
  'billing RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign invoice hidden path=invoices.select.foreign'
);

select throws_ok(
  $$
  insert into public.invoices (tenant_id, patient_id, invoice_code, service, amount, status)
  values ('30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', 'RLS-INV-BLOCKED', 'Blocked', 10, 'pending');
  $$,
  'P0001',
  'Patient does not belong to this tenant',
  'billing RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign invoice insert denied path=invoices.insert.foreign'
);

select is(
  (select count(*) from public.invoice_payments where id = '38100000-0000-0000-0000-000000000002'),
  0::bigint,
  'billing RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign payment hidden path=invoice_payments.select.foreign'
);

select is(
  (select count(*) from public.command_idempotency where id = '38200000-0000-0000-0000-000000000002'),
  0::bigint,
  'billing RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign idempotency hidden path=command_idempotency.select.foreign'
);

select is(
  (select count(*) from public.billing_reconciliation_findings where id = '38400000-0000-0000-0000-000000000002'),
  0::bigint,
  'billing RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign reconciliation finding hidden path=billing_reconciliation_findings.select.foreign'
);

select throws_ok(
  $$
  select * from public.run_billing_reconciliation(
    '30000000-0000-0000-0000-000000000002',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  );
  $$,
  '42501',
  'Tenant mismatch for billing reconciliation',
  'billing RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign reconciliation RPC denied path=run_billing_reconciliation.foreign'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.schedule_billing_reconciliation_jobs()',
    'EXECUTE'
  ),
  false,
  'billing RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=service-role-only scheduler denied path=schedule_billing_reconciliation_jobs.authenticated'
);
\else
select plan(1);
select pass('billing RLS assertions are executed by supabase/tests/rls_suite.sql');
select * from finish();
\endif
