begin;

select plan(18);

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
  public.lab_orders,
  public.insurance_claims,
  public.medications,
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
  '61000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'domain-command@test.com',
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
  ('60000000-0000-0000-0000-000000000001', 'Domain Command Tenant', 'domain-command-tenant', 'active', now()),
  ('60000000-0000-0000-0000-000000000002', 'Foreign Domain Tenant', 'foreign-domain-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'Domain Command User');

insert into public.user_roles (id, user_id, role)
values ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('64000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'PT-DOM-1', 'Domain Patient', 'active');

insert into public.doctors (id, tenant_id, user_id, full_name, specialty, status)
values ('65000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'Domain Doctor', 'Internal Medicine', 'available');

insert into public.lab_orders (
  id,
  tenant_id,
  patient_id,
  doctor_id,
  test_name,
  order_date,
  status
)
values (
  '66000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001',
  '65000000-0000-0000-0000-000000000001',
  'CBC',
  current_date,
  'processing'
);

insert into public.insurance_claims (
  id,
  tenant_id,
  patient_id,
  provider,
  service,
  amount,
  claim_date,
  status
)
values (
  '67000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001',
  'National Health',
  'Consult',
  100,
  current_date,
  'draft'
);

insert into public.medications (
  id,
  tenant_id,
  name,
  category,
  stock,
  unit,
  price,
  status
)
values (
  '68000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  'Amoxicillin',
  'Antibiotic',
  60,
  'tabs',
  12,
  'in_stock'
);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.finalize_lab_result(
    '66000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'completed',
    '11.2 g/dL | 12.0 - 16.0 | low',
    '11.2',
    'g/dL',
    '12.0 - 16.0',
    'low',
    'Mild anemia pattern',
    now(),
    null,
    'lab-key-1',
    'lab-request-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-lab-1',
    'op-lab-1',
    'wf-lab-1'
  )),
  'OK',
  'lab finalization command commits successfully'
);

set local role postgres;

select is(
  (select status from public.lab_orders where id = '66000000-0000-0000-0000-000000000001'),
  'completed',
  'lab finalization updates the lab order'
);

select is(
  (select count(*) from public.domain_events where event_type = 'LabResultUploaded'),
  1::bigint,
  'lab finalization creates one domain event'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'LabResultUploaded'),
  3::bigint,
  'lab domain event creates durable outbox rows'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action = 'lab_result_finalized'
      and details->>'workflow_trace_id' = 'wf-lab-1'
  ),
  'lab finalization writes audit evidence with trace ids'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.domain_events)
  +
  (select count(*) from public.finalize_lab_result(
    '66000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'completed',
    '11.2 g/dL | 12.0 - 16.0 | low',
    '11.2',
    'g/dL',
    '12.0 - 16.0',
    'low',
    'Mild anemia pattern',
    now(),
    null,
    'lab-key-1',
    'lab-request-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-lab-1',
    'op-lab-1',
    'wf-lab-1'
  ))
  -
  (select count(*) from public.domain_events),
  1::bigint,
  'lab idempotency replay returns a response without duplicate events'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.transition_insurance_claim(
    '67000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'submitted',
    null,
    null,
    null,
    'Ready for payer',
    null,
    null,
    null,
    'claim-key-1',
    'claim-request-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-claim-1',
    'op-claim-1',
    'wf-claim-1'
  )),
  'OK',
  'insurance transition command commits successfully'
);

set local role postgres;

select is(
  (select status from public.insurance_claims where id = '67000000-0000-0000-0000-000000000001'),
  'submitted',
  'insurance transition updates claim status'
);

select is(
  (select count(*) from public.domain_events where event_type = 'InsuranceClaimTransitioned'),
  1::bigint,
  'insurance transition creates one domain event'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'InsuranceClaimTransitioned'),
  3::bigint,
  'insurance transition creates durable outbox rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$
  select * from public.transition_insurance_claim(
    '67000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'approved',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    'claim-key-invalid',
    'claim-request-hash-invalid',
    '61000000-0000-0000-0000-000000000001',
    'req-claim-invalid',
    'op-claim-invalid',
    'wf-claim-invalid'
  );
  $$,
  'P0001',
  'Invalid insurance claim status transition: submitted -> approved',
  'insurance command rejects invalid transitions'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.adjust_medication_stock(
    '68000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    20,
    'stock count',
    null,
    'med-key-1',
    'med-request-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-med-1',
    'op-med-1',
    'wf-med-1'
  )),
  'OK',
  'medication stock command commits successfully'
);

set local role postgres;

select is(
  (select stock::text || ':' || status from public.medications where id = '68000000-0000-0000-0000-000000000001'),
  '20:low_stock',
  'medication stock command updates stock and derives status'
);

select is(
  (select count(*) from public.domain_events where event_type = 'MedicationStockAdjusted'),
  1::bigint,
  'medication stock command creates one domain event'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'MedicationStockAdjusted'),
  3::bigint,
  'medication stock command creates durable outbox rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.domain_events)
  +
  (select count(*) from public.adjust_medication_stock(
    '68000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    20,
    'stock count',
    null,
    'med-key-1',
    'med-request-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-med-1',
    'op-med-1',
    'wf-med-1'
  ))
  -
  (select count(*) from public.domain_events),
  1::bigint,
  'medication idempotency replay returns a response without duplicate events'
);

set local role postgres;

select ok(
  exists (
    select 1
    from public.command_idempotency
    where operation_type in ('lab_result_finalize', 'insurance_claim_transition', 'medication_stock_adjust')
      and status = 'committed'
    group by status
    having count(*) = 3
  ),
  'all domain commands record committed idempotency'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$
  select * from public.adjust_medication_stock(
    '68000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000002',
    10,
    'foreign tenant attempt',
    null,
    'med-key-foreign',
    'med-request-hash-foreign',
    '61000000-0000-0000-0000-000000000001',
    'req-med-foreign',
    'op-med-foreign',
    'wf-med-foreign'
  );
  $$,
  '42501',
  'Tenant mismatch for medication stock adjustment',
  'domain commands reject cross-tenant command attempts'
);

select * from finish();
rollback;
