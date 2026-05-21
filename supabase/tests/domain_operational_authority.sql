begin;

select plan(56);

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
  public.inventory_movements,
  public.medication_batches,
  public.stock_receipts,
  public.purchase_order_items,
  public.purchase_orders,
  public.suppliers,
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
  '68000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-000000000001',
  'Ceftriaxone',
  'Antibiotic',
  5,
  'vial',
  30,
  'low_stock'
);

insert into public.suppliers (
  id,
  tenant_id,
  name,
  contact_name,
  email,
  status
)
values (
  '69000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  'Domain Supplier',
  'Procurement Lead',
  'supplier@test.com',
  'active'
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

select is(
  (select result_code from public.command_medication(
    'create',
    null,
    '60000000-0000-0000-0000-000000000001',
    '{"name":"Cefixime","category":"Antibiotic","stock":75,"unit":"tabs","price":20}'::jsonb,
    null,
    'med-create-key-1',
    'med-create-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-med-create-1',
    'op-med-create-1',
    'wf-med-create-1'
  )),
  'OK',
  'medication create command commits successfully'
);

select is(
  (select count(*) from public.domain_events where event_type = 'MedicationCreated'),
  1::bigint,
  'medication create command creates a domain event'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'MedicationCreated'),
  3::bigint,
  'medication create command creates durable outbox rows'
);

select is(
  (select result_code from public.command_medication(
    'update',
    '68000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{"name":"Amoxicillin Forte","stock":55,"price":15}'::jsonb,
    null,
    'med-update-key-1',
    'med-update-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-med-update-1',
    'op-med-update-1',
    'wf-med-update-1'
  )),
  'OK',
  'medication update command commits successfully'
);

select is(
  (select result_code from public.command_medication(
    'update',
    '68000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{"name":"Stale Amoxicillin"}'::jsonb,
    '2000-01-01T00:00:00Z',
    'med-update-stale-key-1',
    'med-update-stale-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-med-update-stale-1',
    'op-med-update-stale-1',
    'wf-med-update-stale-1'
  )),
  'CONFLICT',
  'medication update command returns conflict on stale updated_at'
);

select is(
  (select result_code from public.command_medication(
    'remove',
    '68000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'med-remove-key-1',
    'med-remove-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-med-remove-1',
    'op-med-remove-1',
    'wf-med-remove-1'
  )),
  'OK',
  'medication remove command commits successfully'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action_type = 'medication_remove'
      and details->>'workflow_trace_id' = 'wf-med-remove-1'
  ),
  'medication remove command writes audit evidence with trace ids'
);

select is(
  (select result_code from public.command_insurance_claim(
    'create',
    null,
    '60000000-0000-0000-0000-000000000001',
    '{"patient_id":"64000000-0000-0000-0000-000000000001","provider":"National Health","service":"Lab review","amount":80,"status":"submitted","assigned_to_user_id":"61000000-0000-0000-0000-000000000001"}'::jsonb,
    null,
    'claim-create-key-1',
    'claim-create-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-claim-create-1',
    'op-claim-create-1',
    'wf-claim-create-1'
  )),
  'OK',
  'insurance claim create command commits successfully'
);

select is(
  (select count(*) from public.domain_events where event_type = 'InsuranceClaimCreated'),
  1::bigint,
  'insurance claim create command creates a domain event'
);

select is(
  (select result_code from public.command_insurance_claim(
    'archive',
    '67000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'claim-archive-key-1',
    'claim-archive-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-claim-archive-1',
    'op-claim-archive-1',
    'wf-claim-archive-1'
  )),
  'OK',
  'insurance claim archive command commits successfully'
);

select is(
  (select result_code from public.command_insurance_claim(
    'restore',
    '67000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'claim-restore-key-1',
    'claim-restore-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-claim-restore-1',
    'op-claim-restore-1',
    'wf-claim-restore-1'
  )),
  'OK',
  'insurance claim restore command commits successfully'
);

select is(
  (select result_code from public.command_lab_order(
    'create',
    null,
    '60000000-0000-0000-0000-000000000001',
    '{"patient_id":"64000000-0000-0000-0000-000000000001","doctor_id":"65000000-0000-0000-0000-000000000001","test_name":"Lipid Panel","status":"pending"}'::jsonb,
    null,
    'lab-create-key-1',
    'lab-create-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-lab-create-1',
    'op-lab-create-1',
    'wf-lab-create-1'
  )),
  'OK',
  'lab order create command commits successfully'
);

select is(
  (select result_code from public.command_lab_order(
    'archive',
    '66000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'lab-archive-key-1',
    'lab-archive-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-lab-archive-1',
    'op-lab-archive-1',
    'wf-lab-archive-1'
  )),
  'OK',
  'lab order archive command commits successfully'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action_type = 'lab_order_archive'
      and details->>'workflow_trace_id' = 'wf-lab-archive-1'
  ),
  'lab order archive command writes audit evidence with trace ids'
);

select throws_ok(
  $$
  insert into public.suppliers (
    tenant_id,
    name,
    contact_name,
    email,
    status
  )
  values (
    '60000000-0000-0000-0000-000000000001',
    'Direct Supplier Bypass',
    'Bypass',
    'bypass-supplier@test.com',
    'active'
  );
  $$,
  '42501',
  'new row violates row-level security policy for table "suppliers"',
  'suppliers reject direct authenticated mutation outside command authority'
);

select is(
  (select result_code from public.command_supplier(
    'create',
    null,
    '60000000-0000-0000-0000-000000000001',
    '{"name":"Command Supplier","contact_name":"Ops Lead","phone":"+201000000000","email":"command-supplier@test.com","address":"Main warehouse","status":"active"}'::jsonb,
    null,
    'supplier-create-key-1',
    'supplier-create-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-supplier-create-1',
    'op-supplier-create-1',
    'wf-supplier-create-1'
  )),
  'OK',
  'supplier create command commits successfully'
);

select is(
  (select count(*) from public.domain_events where event_type = 'SupplierCreated'),
  1::bigint,
  'supplier create command creates a domain event'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'SupplierCreated'),
  3::bigint,
  'supplier create command creates durable outbox rows'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action_type = 'supplier_create'
      and details->>'workflow_trace_id' = 'wf-supplier-create-1'
  ),
  'supplier create command writes audit evidence with trace ids'
);

select is(
  (select result_code from public.command_supplier(
    'update',
    '69000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{"name":"Stale Supplier"}'::jsonb,
    '2000-01-01T00:00:00Z',
    'supplier-update-stale-key-1',
    'supplier-update-stale-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-supplier-update-stale-1',
    'op-supplier-update-stale-1',
    'wf-supplier-update-stale-1'
  )),
  'CONFLICT',
  'supplier update command returns conflict on stale updated_at'
);

select is(
  (select result_code from public.command_supplier(
    'archive',
    '69000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'supplier-archive-key-1',
    'supplier-archive-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-supplier-archive-1',
    'op-supplier-archive-1',
    'wf-supplier-archive-1'
  )),
  'OK',
  'supplier archive command commits successfully'
);

select is(
  (select result_code from public.command_supplier(
    'restore',
    '69000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'supplier-restore-key-1',
    'supplier-restore-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-supplier-restore-1',
    'op-supplier-restore-1',
    'wf-supplier-restore-1'
  )),
  'OK',
  'supplier restore command commits successfully'
);

select is(
  (select count(*) from public.domain_events)
  +
  (select count(*) from public.command_supplier(
    'create',
    null,
    '60000000-0000-0000-0000-000000000001',
    '{"name":"Command Supplier","contact_name":"Ops Lead","phone":"+201000000000","email":"command-supplier@test.com","address":"Main warehouse","status":"active"}'::jsonb,
    null,
    'supplier-create-key-1',
    'supplier-create-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-supplier-create-1',
    'op-supplier-create-1',
    'wf-supplier-create-1'
  ))
  -
  (select count(*) from public.domain_events),
  1::bigint,
  'supplier idempotency replay returns a response without duplicate events'
);

select throws_ok(
  $$
  insert into public.purchase_orders (
    tenant_id,
    supplier_id,
    status,
    order_date,
    total_amount,
    notes
  )
  values (
    '60000000-0000-0000-0000-000000000001',
    '69000000-0000-0000-0000-000000000001',
    'submitted',
    current_date,
    90,
    'direct procurement bypass attempt'
  );
  $$,
  '42501',
  'new row violates row-level security policy for table "purchase_orders"',
  'procurement purchase orders reject direct authenticated mutation outside command authority'
);

select is(
  (select result_code from public.command_purchase_order(
    'create',
    null,
    '60000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'supplier_id', '69000000-0000-0000-0000-000000000001',
      'status', 'submitted',
      'notes', 'Wave 3-B stock replenishment',
      'items', jsonb_build_array(jsonb_build_object(
        'medication_id', '68000000-0000-0000-0000-000000000002',
        'quantity', 12,
        'unit_cost', 7.5
      ))
    ),
    null,
    'po-create-key-1',
    'po-create-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-po-create-1',
    'op-po-create-1',
    'wf-po-create-1'
  )),
  'OK',
  'purchase order create command commits successfully'
);

select is(
  (select count(*) from public.domain_events where event_type = 'PurchaseOrderCreated'),
  1::bigint,
  'purchase order create command creates a domain event'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'PurchaseOrderCreated'),
  3::bigint,
  'purchase order create command creates durable outbox rows'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action_type = 'purchase_order_create'
      and details->>'workflow_trace_id' = 'wf-po-create-1'
  ),
  'purchase order create command writes audit evidence with trace ids'
);

select is(
  (select result_code from public.command_purchase_order(
    'update',
    (select id from public.purchase_orders where supplier_id = '69000000-0000-0000-0000-000000000001' order by created_at desc limit 1),
    '60000000-0000-0000-0000-000000000001',
    '{"notes":"stale update"}'::jsonb,
    '2000-01-01T00:00:00Z',
    'po-update-stale-key-1',
    'po-update-stale-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-po-update-stale-1',
    'op-po-update-stale-1',
    'wf-po-update-stale-1'
  )),
  'CONFLICT',
  'purchase order update command returns conflict on stale updated_at'
);

select is(
  (select result_code from public.receive_procurement_stock(
    (select id from public.purchase_orders where supplier_id = '69000000-0000-0000-0000-000000000001' order by created_at desc limit 1),
    (select id from public.purchase_order_items where medication_id = '68000000-0000-0000-0000-000000000002' order by created_at desc limit 1),
    '60000000-0000-0000-0000-000000000001',
    12,
    'LOT-W3B-001',
    '2027-01-01',
    now(),
    'received by Wave 3-B command',
    'receipt-key-1',
    'receipt-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-receipt-1',
    'op-receipt-1',
    'wf-receipt-1'
  )),
  'OK',
  'procurement stock receipt command commits successfully'
);

set local role postgres;

select is(
  (select stock::text || ':' || status from public.medications where id = '68000000-0000-0000-0000-000000000002'),
  '17:low_stock',
  'procurement receipt updates medication stock and derives status'
);

select is(
  (select status from public.purchase_orders where supplier_id = '69000000-0000-0000-0000-000000000001' order by created_at desc limit 1),
  'received',
  'procurement receipt closes a fully received purchase order'
);

select is(
  (select count(*)::text from public.stock_receipts where purchase_order_id = (select id from public.purchase_orders where supplier_id = '69000000-0000-0000-0000-000000000001' order by created_at desc limit 1))
  || ':' ||
  (select count(*)::text from public.medication_batches where medication_id = '68000000-0000-0000-0000-000000000002')
  || ':' ||
  (select count(*)::text from public.inventory_movements where medication_id = '68000000-0000-0000-0000-000000000002' and movement_type = 'receipt'),
  '1:1:1',
  'procurement receipt persists receipt, batch, and inventory movement atomically'
);

select is(
  (select count(*) from public.domain_events where event_type = 'ProcurementStockReceived'),
  1::bigint,
  'procurement stock receipt creates a domain event'
);

select is(
  (select count(*) from public.event_outbox where event_type = 'ProcurementStockReceived'),
  3::bigint,
  'procurement stock receipt creates durable outbox rows'
);

select ok(
  exists (
    select 1
    from public.audit_logs
    where action_type = 'procurement_stock_receive'
      and details->>'workflow_trace_id' = 'wf-receipt-1'
  ),
  'procurement stock receipt writes audit evidence with trace ids'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.domain_events)
  +
  (select count(*) from public.receive_procurement_stock(
    (select id from public.purchase_orders where supplier_id = '69000000-0000-0000-0000-000000000001' order by created_at desc limit 1),
    (select id from public.purchase_order_items where medication_id = '68000000-0000-0000-0000-000000000002' order by created_at desc limit 1),
    '60000000-0000-0000-0000-000000000001',
    12,
    'LOT-W3B-001',
    '2027-01-01',
    now(),
    'received by Wave 3-B command',
    'receipt-key-1',
    'receipt-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-receipt-1',
    'op-receipt-1',
    'wf-receipt-1'
  ))
  -
  (select count(*) from public.domain_events),
  1::bigint,
  'procurement receipt idempotency replay returns a response without duplicate events'
);

select throws_ok(
  $$
  select * from public.receive_procurement_stock(
    (select id from public.purchase_orders where supplier_id = '69000000-0000-0000-0000-000000000001' order by created_at desc limit 1),
    (select id from public.purchase_order_items where medication_id = '68000000-0000-0000-0000-000000000002' order by created_at desc limit 1),
    '60000000-0000-0000-0000-000000000002',
    1,
    'LOT-FOREIGN',
    '2027-01-01',
    now(),
    'foreign tenant attempt',
    'receipt-foreign-key-1',
    'receipt-foreign-hash-1',
    '61000000-0000-0000-0000-000000000001',
    'req-receipt-foreign-1',
    'op-receipt-foreign-1',
    'wf-receipt-foreign-1'
  );
  $$,
  '42501',
  'Tenant mismatch for procurement stock receipt',
  'procurement receipt rejects cross-tenant command attempts'
);

select * from finish();
rollback;
