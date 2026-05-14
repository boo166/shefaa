\if :{?rls_suite}
set local role authenticated;
set local row_security = on;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.audit_logs where id = '38800000-0000-0000-0000-000000000001'),
  1::bigint,
  'admin RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=tenant audit visible path=audit_logs.select.own'
);

select is(
  (select count(*) from public.audit_logs where id in ('38800000-0000-0000-0000-000000000002', '38800000-0000-0000-0000-000000000099')),
  0::bigint,
  'admin RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign/global audit hidden path=audit_logs.select.foreign_or_global'
);

select throws_ok(
  $$
  insert into public.audit_logs (tenant_id, user_id, actor_id, action, action_type, entity_type, resource_type, metadata, is_global)
  values ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'client_insert', 'client_insert', 'patient', 'patient', '{}'::jsonb, false);
  $$,
  '42501',
  'new row violates row-level security policy for table "audit_logs"',
  'admin RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=direct audit insert denied path=audit_logs.insert.client'
);

select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000099', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '31000000-0000-0000-0000-000000000099',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', 'super-session-1'
  )::text,
  true
);

select is(
  (select count(*) from public.audit_logs),
  3::bigint,
  'admin RLS snapshot tenant=global actor=31000000-0000-0000-0000-000000000099 expected=super admin audit bypass visible path=audit_logs.select.super_admin'
);

select is(
  (select count(*) from public.patients where id in ('34000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000002')),
  2::bigint,
  'admin RLS snapshot tenant=global actor=31000000-0000-0000-0000-000000000099 expected=super admin cross-tenant PHI bypass explicit path=patients.select.super_admin'
);
\else
select plan(1);
select pass('admin RLS assertions are executed by supabase/tests/rls_suite.sql');
select * from finish();
\endif
