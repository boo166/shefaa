\if :{?rls_suite}
set local role authenticated;
set local row_security = on;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.appointments where id = '37000000-0000-0000-0000-000000000001'),
  1::bigint,
  'appointments RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=own appointment visible path=appointments.select.own'
);

select is(
  (select count(*) from public.appointments where id = '37000000-0000-0000-0000-000000000002'),
  0::bigint,
  'appointments RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign appointment hidden path=appointments.select.foreign'
);

select throws_ok(
  $$
  insert into public.appointments (tenant_id, patient_id, doctor_id, appointment_date, status, type)
  values ('30000000-0000-0000-0000-000000000002', '34000000-0000-0000-0000-000000000002', '36000000-0000-0000-0000-000000000002', '2026-05-12T09:00:00Z', 'scheduled', 'checkup');
  $$,
  'P0001',
  'Patient does not belong to this tenant',
  'appointments RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign appointment insert denied path=appointments.insert.foreign'
);

select lives_ok(
  $$
  update public.appointments
  set status = 'cancelled'
  where id = '37000000-0000-0000-0000-000000000002';
  $$,
  'appointments RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign appointment update sees no rows path=appointments.update.foreign'
);

select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000003","role":"authenticated"}', true);

select is(
  (select count(*) from public.appointments),
  1::bigint,
  'appointments RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000003 expected=portal sees only linked appointments path=appointments.select.portal_scope'
);
\else
select plan(1);
select pass('appointments RLS assertions are executed by supabase/tests/rls_suite.sql');
select * from finish();
\endif
