begin;

select plan(16);

set local role postgres;
set local session_replication_role = replica;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);

truncate
  public.patient_reconciliation_findings,
  public.patient_reconciliation_runs,
  public.patient_retention_policies,
  public.audit_logs,
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
values (
  '00000000-0000-0000-0000-000000000000',
  '71000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'patient-visibility@test.com',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('70000000-0000-0000-0000-000000000001', 'Patient Visibility Tenant', 'patient-visibility-tenant', 'active', now());

insert into public.subscriptions (tenant_id, plan, status, amount, currency, billing_cycle, started_at)
values ('70000000-0000-0000-0000-000000000001', 'pro', 'active', 200, 'EGP', 'monthly', now())
on conflict (tenant_id) do update
set plan = excluded.plan, status = excluded.status;

insert into public.feature_flags (tenant_id, feature_key, enabled)
values ('70000000-0000-0000-0000-000000000001', 'advanced_reports', true)
on conflict (tenant_id, feature_key) do update set enabled = excluded.enabled;

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Patient Visibility User');

insert into public.user_roles (id, user_id, role)
values ('73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('74000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'VIS-ACTIVE', 'Visible Surface Patient', 'active');

insert into public.patients (id, tenant_id, patient_code, full_name, status, deleted_at)
values ('74000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'VIS-DELETED', 'Deleted Surface Patient', 'inactive', now() - interval '1 day');

insert into public.patients (id, tenant_id, patient_code, full_name, status, deleted_at)
values ('74000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 'VIS-ARCHIVED', 'Archived Surface Patient', 'inactive', now() - interval '30 days');

insert into public.patients (id, tenant_id, patient_code, full_name, status, deleted_at)
values ('74000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', 'VIS-LEGAL', 'Legal Hold Surface Patient', 'inactive', now() - interval '10 days');

insert into public.patients (id, tenant_id, patient_code, full_name, status, deleted_at)
values ('74000000-0000-0000-0000-000000000005', '70000000-0000-0000-0000-000000000001', 'VIS-EXPIRED', 'Retention Expired Surface Patient', 'inactive', now() - interval '2 years');

insert into public.patient_retention_policies (
  tenant_id,
  soft_deleted_retention_years,
  legal_hold_patient_ids
)
values (
  '70000000-0000-0000-0000-000000000001',
  1,
  array['74000000-0000-0000-0000-000000000004'::uuid]
)
on conflict (tenant_id) do update
set soft_deleted_retention_years = excluded.soft_deleted_retention_years,
    legal_hold_patient_ids = excluded.legal_hold_patient_ids;

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select ok(
  exists (select 1 from public.search_global('Visible Surface Patient', 10) where entity_id = '74000000-0000-0000-0000-000000000001'),
  'global search includes active visible patient'
);

select is(
  (select count(*) from public.search_global('Deleted Surface Patient', 10)),
  0::bigint,
  'global search excludes soft-deleted patient'
);

select is(
  (select count(*) from public.search_global('Archived Surface Patient', 10)),
  0::bigint,
  'global search excludes archived soft-deleted patient'
);

select is(
  (select count(*) from public.search_global('Legal Hold Surface Patient', 10)),
  0::bigint,
  'global search excludes legal-hold soft-deleted patient'
);

select is(
  (select count(*) from public.search_global('Retention Expired Surface Patient', 10)),
  0::bigint,
  'global search excludes retention-expired soft-deleted patient'
);

select is(
  (select total_patients from public.get_report_overview('70000000-0000-0000-0000-000000000001')),
  1::bigint,
  'report overview counts only non-deleted patients'
);

select is(
  (select count(*) from public.search_global('Surface Patient', 20)),
  1::bigint,
  'global search surface returns only the active visible patient for shared term'
);

set local role postgres;

select ok(
  (select finding_count >= 2 from public.run_patient_reconciliation(
    '70000000-0000-0000-0000-000000000001',
    now() - interval '30 days',
    now(),
    false,
    'req-visibility-reconcile',
    'op-visibility-reconcile',
    'wf-visibility-reconcile'
  )),
  'patient reconciliation records retention and legal-hold findings'
);

select ok(
  exists (
    select 1
    from public.patient_reconciliation_findings
    where finding_code = 'retention_expired_patient'
      and patient_id = '74000000-0000-0000-0000-000000000005'
  ),
  'reconciliation detects retention-expired patient'
);

select ok(
  exists (
    select 1
    from public.patient_reconciliation_findings
    where finding_code = 'legal_hold_patient_retained'
      and patient_id = '74000000-0000-0000-0000-000000000004'
  ),
  'reconciliation preserves legal-hold patient as operator-visible finding'
);

select ok(
  not exists (
    select 1
    from public.patient_reconciliation_findings
    where finding_code = 'retention_expired_patient'
      and patient_id = '74000000-0000-0000-0000-000000000004'
  ),
  'legal-hold patient is excluded from destructive retention-expired finding'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'patient_reconciliation_run'
      and details->>'workflow_trace_id' = 'wf-visibility-reconcile'
  ),
  'patient reconciliation run writes audit evidence with trace ids'
);

select is(
  (select count(*) from public.patients where tenant_id = '70000000-0000-0000-0000-000000000001'),
  5::bigint,
  'fixture retains all patient rows for reconciliation even when hidden from surfaces'
);

select is(
  (select count(*) from public.search_global('VIS-DELETED', 10)),
  0::bigint,
  'global search excludes deleted patient by patient code'
);

select is(
  (select count(*) from public.search_global('VIS-LEGAL', 10)),
  0::bigint,
  'global search excludes legal-hold patient by patient code'
);

select * from finish();
rollback;
