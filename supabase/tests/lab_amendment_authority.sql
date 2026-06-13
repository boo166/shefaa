begin;

select plan(13);

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
  public.lab_result_versions,
  public.lab_orders,
  public.doctors,
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
  'a1000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'lab-amend@test.com',
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
  ('a0000000-0000-0000-0000-000000000001', 'Lab Amend Tenant', 'lab-amend-tenant', 'active', now()),
  ('a0000000-0000-0000-0000-000000000002', 'Foreign Lab Tenant', 'foreign-lab-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Lab Amend User');

insert into public.user_roles (id, user_id, role)
values ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'PT-LAB-1', 'Lab Patient', 'active');

insert into public.doctors (id, tenant_id, user_id, full_name, specialty, status)
values ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Lab Doctor', 'Pathology', 'available');

insert into public.lab_orders (
  id, tenant_id, patient_id, doctor_id, test_name, order_date, status,
  result_value, result_unit, reference_range, abnormal_flag, result_notes, resulted_at
)
values (
  'a6000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'HbA1c',
  current_date,
  'completed',
  '6.1',
  '%',
  '4.0-5.6',
  'high',
  'Initial result',
  now()
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_lab_result_amend(
    'a6000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'result_value', '6.4',
      'result_unit', '%',
      'reference_range', '4.0-5.6',
      'abnormal_flag', 'high',
      'result_notes', 'Corrected transcription',
      'amendment_reason', 'Verified against source instrument'
    ),
    null,
    'lab-amend-key-1',
    'lab-amend-hash-1',
    'a1000000-0000-0000-0000-000000000001',
    'req-lab-amend-1',
    'op-lab-amend-1',
    'wf-lab-amend-1'
  )),
  'OK',
  'lab result amend command commits successfully'
);

set local role postgres;

select is(
  (select result_value from public.lab_orders where id = 'a6000000-0000-0000-0000-000000000001'),
  '6.4',
  'lab result amend updates current lab order values'
);

select is(
  (select result_value from public.lab_result_versions where lab_order_id = 'a6000000-0000-0000-0000-000000000001' and version_number = 1),
  '6.1',
  'lab result amend stores immutable previous version snapshot'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action_type = 'lab_result_amend'
      and details ? 'previous'
      and details ? 'current'
      and details->'previous'->>'result_value' = '6.1'
      and details->'current'->>'result_value' = '6.4'
      and details->>'workflow_trace_id' = 'wf-lab-amend-1'
  ),
  'lab result amend audit stores previous and current evidence'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);

select is(
  (select result_code from public.command_lab_result_amend(
    'a6000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'result_value', '6.5',
      'amendment_reason', 'Second verification'
    ),
    null,
    'lab-amend-key-2',
    'lab-amend-hash-2',
    'a1000000-0000-0000-0000-000000000001',
    'req-lab-amend-2',
    'op-lab-amend-2',
    'wf-lab-amend-2'
  )),
  'OK',
  'second lab result amend appends next version'
);

set local role postgres;

select is(
  (select count(*)::text || ':' || max(version_number)::text from public.lab_result_versions where lab_order_id = 'a6000000-0000-0000-0000-000000000001'),
  '2:2',
  'lab result versions accumulate immutable amendment chain'
);

select is(
  (select result_value from public.lab_result_versions where lab_order_id = 'a6000000-0000-0000-0000-000000000001' and version_number = 2),
  '6.4',
  'second version snapshot captures prior current value'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);

select is(
  (select idempotency_replay from public.command_lab_result_amend(
    'a6000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    jsonb_build_object('result_value', '6.5', 'amendment_reason', 'Second verification'),
    null,
    'lab-amend-key-2',
    'lab-amend-hash-2',
    'a1000000-0000-0000-0000-000000000001',
    'req-lab-amend-2',
    'op-lab-amend-2',
    'wf-lab-amend-2'
  )),
  true,
  'lab result amend idempotency replays without duplicate mutation'
);

select is(
  (select count(*) from public.lab_result_versions where lab_order_id = 'a6000000-0000-0000-0000-000000000001'),
  2::bigint,
  'lab result amend replay does not append duplicate versions'
);

select throws_ok(
  $$
    select * from public.command_lab_result_amend(
      'a6000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000002',
      '{"result_value":"7.0"}'::jsonb,
      null,
      'foreign-amend-key',
      'foreign-amend-hash',
      'a1000000-0000-0000-0000-000000000001',
      'req-foreign-amend',
      'op-foreign-amend',
      'wf-foreign-amend'
    );
  $$,
  '42501',
  'Tenant mismatch for lab result amend command',
  'lab result amend rejects cross-tenant scope'
);

insert into public.lab_orders (
  id, tenant_id, patient_id, doctor_id, test_name, order_date, status
)
values (
  'a6000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'CBC',
  current_date,
  'processing'
);

select throws_ok(
  $$
    select * from public.command_lab_result_amend(
      'a6000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000001',
      '{"result_value":"12.0"}'::jsonb,
      null,
      'pending-amend-key',
      'pending-amend-hash',
      'a1000000-0000-0000-0000-000000000001',
      'req-pending-amend',
      'op-pending-amend',
      'wf-pending-amend'
    );
  $$,
  null,
  'Only finalized lab results can be amended',
  'lab result amend rejects non-completed orders'
);

select ok(
  exists (select 1 from public.domain_events where event_type = 'LabResultAmended'),
  'lab result amend writes domain event'
);

select ok(
  exists (
    select 1 from public.event_outbox where event_type = 'LabResultAmended'
  ),
  'lab result amend enqueues durable outbox rows'
);

select * from finish();
rollback;
