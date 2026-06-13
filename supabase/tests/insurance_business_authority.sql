begin;

select plan(14);

set local role postgres;
set local session_replication_role = replica;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);

truncate
  public.dead_letter_events,
  public.event_delivery_attempts,
  public.event_outbox,
  public.domain_events,
  public.system_logs,
  public.command_idempotency,
  public.audit_logs,
  public.insurance_coverage_policies,
  public.insurance_claims,
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
  '91000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'insurance-command@test.com',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values
  ('90000000-0000-0000-0000-000000000001', 'Insurance Command Tenant', 'insurance-command-tenant', 'active', now()),
  ('90000000-0000-0000-0000-000000000002', 'Foreign Insurance Tenant', 'foreign-insurance-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Insurance Command User');

insert into public.user_roles (id, user_id, role)
values ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('94000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'PT-INS-1', 'Insurance Patient', 'active');

insert into public.insurance_coverage_policies (
  tenant_id, payer, service_code, coverage_percent, effective_from, is_active
)
values (
  '90000000-0000-0000-0000-000000000001',
  'National Health',
  'Consult',
  80,
  current_date - interval '30 days',
  true
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_insurance_claim(
    'create',
    null,
    '90000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'patient_id', '94000000-0000-0000-0000-000000000001',
      'provider', 'National Health',
      'service', 'Consult',
      'amount', 150,
      'claim_date', current_date,
      'status', 'draft'
    ),
    null,
    'claim-create-key-1',
    'claim-create-hash-1',
    '91000000-0000-0000-0000-000000000001',
    'req-claim-create-1',
    'op-claim-create-1',
    'wf-claim-create-1'
  )),
  'OK',
  'insurance claim draft create commits successfully'
);

select id as insurance_claim_id from public.insurance_claims where service = 'Consult' and status = 'draft' \gset

select is(
  (select result_code from public.command_insurance_claim(
    'submit',
    :'insurance_claim_id'::uuid,
    '90000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'claim-submit-key-1',
    'claim-submit-hash-1',
    '91000000-0000-0000-0000-000000000001',
    'req-claim-submit-1',
    'op-claim-submit-1',
    'wf-claim-submit-1'
  )),
  'OK',
  'insurance claim submit validates coverage and commits successfully'
);

set local role postgres;

select is(
  (select status from public.insurance_claims where id = :'insurance_claim_id'::uuid),
  'submitted',
  'insurance claim submit transitions claim to submitted'
);

select ok(
  public.validate_insurance_claim_coverage(
    '90000000-0000-0000-0000-000000000001',
    'National Health',
    'Consult',
    current_date
  ),
  'coverage validation helper returns true for active policy'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select is(
  (select result_code from public.command_insurance_claim(
    'create',
    null,
    '90000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'patient_id', '94000000-0000-0000-0000-000000000001',
      'provider', 'National Health',
      'service', 'Consult',
      'amount', 150,
      'claim_date', current_date,
      'status', 'submitted'
    ),
    null,
    'claim-duplicate-key-1',
    'claim-duplicate-hash-1',
    '91000000-0000-0000-0000-000000000001',
    'req-claim-duplicate-1',
    'op-claim-duplicate-1',
    'wf-claim-duplicate-1'
  )),
  'CONFLICT',
  'duplicate submitted insurance claim returns conflict'
);

select throws_ok(
  $$
    select * from public.command_insurance_claim(
      'create',
      null,
      '90000000-0000-0000-0000-000000000001',
      jsonb_build_object(
        'patient_id', '94000000-0000-0000-0000-000000000001',
        'provider', 'Unknown Payer',
        'service', 'Consult',
        'amount', 150,
        'claim_date', current_date,
        'status', 'submitted'
      ),
      null,
      'claim-no-coverage-throws-key',
      'claim-no-coverage-throws-hash',
      '91000000-0000-0000-0000-000000000001',
      'req-claim-no-coverage-throws',
      'op-claim-no-coverage-throws',
      'wf-claim-no-coverage-throws'
    );
  $$,
  null,
  'No active insurance coverage policy matches this claim',
  'submitted claim without coverage raises validation error'
);

select is(
  (select result_code from public.command_insurance_claim(
    'create',
    null,
    '90000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'patient_id', '94000000-0000-0000-0000-000000000001',
      'provider', 'National Health',
      'service', 'MRI',
      'amount', 500,
      'claim_date', current_date,
      'status', 'draft'
    ),
    null,
    'claim-submit-no-coverage-key',
    'claim-submit-no-coverage-hash',
    '91000000-0000-0000-0000-000000000001',
    'req-claim-submit-no-coverage',
    'op-claim-submit-no-coverage',
    'wf-claim-submit-no-coverage'
  )),
  'OK',
  'draft claim without matching coverage can be created'
);

select id as insurance_draft_claim_id from public.insurance_claims where service = 'MRI' and status = 'draft' \gset

select throws_ok(
  format($$
    select * from public.command_insurance_claim(
      'submit',
      %L::uuid,
      '90000000-0000-0000-0000-000000000001',
      '{}'::jsonb,
      null,
      'claim-submit-no-coverage-throws-key',
      'claim-submit-no-coverage-throws-hash',
      '91000000-0000-0000-0000-000000000001',
      'req-claim-submit-no-coverage-throws',
      'op-claim-submit-no-coverage-throws',
      'wf-claim-submit-no-coverage-throws'
    );
  $$, :'insurance_draft_claim_id'),
  null,
  'No active insurance coverage policy matches this claim',
  'submit operation rejects claim without active coverage'
);

select is(
  (select result_code from public.command_insurance_claim(
    'create',
    null,
    '90000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'patient_id', '94000000-0000-0000-0000-000000000001',
      'provider', 'National Health',
      'service', 'Consult',
      'amount', 120,
      'claim_date', current_date,
      'status', 'draft'
    ),
    null,
    'claim-denied-duplicate-key',
    'claim-denied-duplicate-hash',
    '91000000-0000-0000-0000-000000000001',
    'req-claim-denied-duplicate',
    'op-claim-denied-duplicate',
    'wf-claim-denied-duplicate'
  )),
  'OK',
  'second draft claim with same tuple can be created before submit'
);

select id as insurance_denied_claim_id from public.insurance_claims where service = 'Consult' and status = 'draft' and id <> :'insurance_claim_id'::uuid order by created_at desc limit 1 \gset

set local role postgres;

update public.insurance_claims
set status = 'denied', denial_reason = 'Not covered'
where id = :'insurance_denied_claim_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

select is(
  (select result_code from public.command_insurance_claim(
    'create',
    null,
    '90000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'patient_id', '94000000-0000-0000-0000-000000000001',
      'provider', 'National Health',
      'service', 'Consult',
      'amount', 180,
      'claim_date', current_date,
      'status', 'submitted'
    ),
    null,
    'claim-after-denied-key',
    'claim-after-denied-hash',
    '91000000-0000-0000-0000-000000000001',
    'req-claim-after-denied',
    'op-claim-after-denied',
    'wf-claim-after-denied'
  )),
  'OK',
  'denied claim does not block a new submitted claim for same tuple'
);

select throws_ok(
  format($$
    select * from public.command_insurance_claim(
      'submit',
      %L::uuid,
      '90000000-0000-0000-0000-000000000002',
      '{}'::jsonb,
      null,
      'foreign-submit-key',
      'foreign-submit-hash',
      '91000000-0000-0000-0000-000000000001',
      'req-foreign-submit',
      'op-foreign-submit',
      'wf-foreign-submit'
    );
  $$, :'insurance_claim_id'),
  '42501',
  'Tenant mismatch for insurance claim command',
  'insurance claim command rejects cross-tenant scope'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action_type = 'insurance_claim_submit'
      and details->>'workflow_trace_id' = 'wf-claim-submit-1'
  ),
  'insurance claim submit audit includes trace evidence'
);

select is(
  (select count(*) from public.insurance_claims where tenant_id = '90000000-0000-0000-0000-000000000001' and service = 'Consult' and claim_date = current_date and status = 'submitted'),
  2::bigint,
  'duplicate guard allows only one active submitted claim per tuple'
);

select * from finish();
rollback;
