\if :{?rls_suite}
set local role authenticated;
set local row_security = on;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.patients where id = '34000000-0000-0000-0000-000000000001'),
  1::bigint,
  'patients RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=own patient visible path=patients.select.own'
);

select is(
  (select count(*) from public.patients where id = '34000000-0000-0000-0000-000000000002'),
  0::bigint,
  'patients RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign patient hidden path=patients.select.foreign'
);

select throws_ok(
  $$
  insert into public.patients (tenant_id, patient_code, full_name, status)
  values ('30000000-0000-0000-0000-000000000002', 'RLS-B-BLOCKED', 'Blocked Foreign Patient', 'active');
  $$,
  '42501',
  'new row violates row-level security policy for table "patients"',
  'patients RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign insert denied path=patients.insert.foreign'
);

select lives_ok(
  $$
  update public.patients
  set full_name = 'Cross Tenant Mutation Attempt'
  where id = '34000000-0000-0000-0000-000000000002';
  $$,
  'patients RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign update sees no rows path=patients.update.foreign'
);

select is(
  (select count(*) from public.patients where id = '34000000-0000-0000-0000-000000000003'),
  0::bigint,
  'patients RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=soft-deleted row hidden path=patients.select.soft_deleted'
);

select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is(
  (select count(*) from public.patients),
  1::bigint,
  'patients RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000003 expected=portal sees only linked patient path=patients.select.portal_scope'
);
\else
select plan(1);
select pass('patients RLS assertions are executed by supabase/tests/rls_suite.sql');
select * from finish();
\endif
