\if :{?rls_suite}
set local role authenticated;
set local row_security = on;
select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2","session_id":"tenant-session-1"}', true);

select throws_ok(
  $$ select * from public.admin_start_tenant_impersonation('30000000-0000-0000-0000-000000000002'); $$,
  '42501',
  'Only super admins can access admin operations',
  'impersonation RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=tenant admin cannot start impersonation path=admin_start_tenant_impersonation.tenant_actor'
);

select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000099', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', '31000000-0000-0000-0000-000000000099',
    'role', 'authenticated',
    'aal', 'aal2',
    'session_id', 'super-session-1',
    'amr', json_build_array(
      json_build_object(
        'method', 'password',
        'timestamp', floor(extract(epoch from now()))::bigint
      )
    )
  )::text,
  true
);

select throws_ok(
  $$ select * from public.admin_start_tenant_impersonation('30000000-0000-0000-0000-000000000001'); $$,
  '42501',
  'Valid privileged step-up grant required for this action',
  'impersonation RLS snapshot tenant=global actor=31000000-0000-0000-0000-000000000099 expected=missing step-up denied path=admin_start_tenant_impersonation.no_grant'
);

select is(
  (
    select target_tenant_id
    from public.admin_start_tenant_impersonation(
      '30000000-0000-0000-0000-000000000002',
      '39000000-0000-0000-0000-000000000001',
      '38900000-0000-0000-0000-000000000001'
    )
  ),
  '30000000-0000-0000-0000-000000000002'::uuid,
  'impersonation RLS snapshot tenant=30000000-0000-0000-0000-000000000002 actor=31000000-0000-0000-0000-000000000099 expected=scoped impersonation starts only for granted tenant path=admin_start_tenant_impersonation.scoped_grant'
);

select throws_ok(
  $$
  select * from public.admin_start_tenant_impersonation(
    '30000000-0000-0000-0000-000000000001',
    '39000000-0000-0000-0000-000000000002',
    '38900000-0000-0000-0000-000000000002'
  );
  $$,
  'P0001',
  'Only one active impersonation session is allowed per actor',
  'impersonation RLS snapshot tenant=global actor=31000000-0000-0000-0000-000000000099 expected=active impersonation cannot escape into second tenant path=admin_start_tenant_impersonation.one_active_session'
);

select is(
  (select count(*) from public.admin_impersonation_sessions),
  0::bigint,
  'impersonation RLS snapshot tenant=global actor=31000000-0000-0000-0000-000000000099 expected=session ledger not directly readable path=admin_impersonation_sessions.select.direct'
);

select set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"31000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.audit_logs where action_type in ('tenant_impersonation_start', 'tenant_impersonation_started')),
  0::bigint,
  'impersonation RLS snapshot tenant=30000000-0000-0000-0000-000000000001 actor=31000000-0000-0000-0000-000000000001 expected=foreign impersonation audit hidden path=audit_logs.select.impersonation_foreign'
);
\else
select plan(1);
select pass('impersonation RLS assertions are executed by supabase/tests/rls_suite.sql');
select * from finish();
\endif
