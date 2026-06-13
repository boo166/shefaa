begin;

select plan(6);

set local role postgres;
set local session_replication_role = replica;

truncate public.user_roles, public.profiles, public.tenants restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rbac-pharmacist@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rbac-labtech@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '81000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'rbac-nurse@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('80000000-0000-0000-0000-000000000001', 'RBAC Matrix Tenant', 'rbac-matrix-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values
  ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Pharmacist User'),
  ('82000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000001', 'Lab Tech User'),
  ('82000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001', 'Nurse User');

insert into public.user_roles (id, user_id, role)
values
  ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'pharmacist'),
  ('83000000-0000-0000-0000-000000000002', '81000000-0000-0000-0000-000000000002', 'lab_technician'),
  ('83000000-0000-0000-0000-000000000003', '81000000-0000-0000-0000-000000000003', 'nurse');

insert into public.subscriptions (tenant_id, plan, status, amount, currency, billing_cycle, started_at)
values ('80000000-0000-0000-0000-000000000001', 'enterprise', 'active', 500, 'EGP', 'monthly', now())
on conflict (tenant_id) do update set status = excluded.status, plan = excluded.plan;

insert into public.feature_flags (tenant_id, feature_key, enabled)
values
  ('80000000-0000-0000-0000-000000000001', 'pharmacy', true),
  ('80000000-0000-0000-0000-000000000001', 'laboratory', true),
  ('80000000-0000-0000-0000-000000000001', 'billing', true)
on conflict do nothing;

set local session_replication_role = origin;

-- Pharmacist can access pharmacy guard
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select lives_ok($$ select public.assert_can_access_pharmacy() $$, 'pharmacist passes assert_can_access_pharmacy');

select throws_ok($$ select public.assert_can_access_laboratory() $$, '42501', 'Forbidden', 'pharmacist denied laboratory guard');

-- Lab technician can access laboratory guard
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000002', true);
select lives_ok($$ select public.assert_can_access_laboratory() $$, 'lab_technician passes assert_can_access_laboratory');

select throws_ok($$ select public.assert_can_access_pharmacy() $$, '42501', 'Forbidden', 'lab_technician denied pharmacy guard');

-- Nurse denied billing guard
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.assert_can_access_billing() $$, '42501', 'Forbidden', 'nurse denied billing guard');

select ok(
  public.has_role('81000000-0000-0000-0000-000000000001', 'pharmacist'::public.app_role),
  'pharmacist role is registered in app_role enum'
);

select ok(
  public.has_role('81000000-0000-0000-0000-000000000002', 'lab_technician'::public.app_role),
  'lab_technician role is registered in app_role enum'
);

select * from finish();
rollback;
