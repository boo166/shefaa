begin;

select plan(16);

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
  public.medication_reservations,
  public.inventory_movements,
  public.medication_batches,
  public.medications,
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
  '81000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'inventory-command@test.com',
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
  ('80000000-0000-0000-0000-000000000001', 'Inventory Command Tenant', 'inventory-command-tenant', 'active', now()),
  ('80000000-0000-0000-0000-000000000002', 'Foreign Inventory Tenant', 'foreign-inventory-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('82000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'Inventory Command User');

insert into public.user_roles (id, user_id, role)
values ('83000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('84000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'PT-INV-1', 'Inventory Patient', 'active');

insert into public.medications (id, tenant_id, name, category, stock, reserved_quantity, unit, price, status)
values (
  '85000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'Metformin',
  'Diabetes',
  20,
  0,
  'tablets',
  8,
  'low_stock'
);

insert into public.medication_batches (id, tenant_id, medication_id, lot_number, expiry_date, quantity)
values
  (
    '86000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000001',
    'LOT-VALID',
    current_date + interval '180 days',
    20
  ),
  (
    '86000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000001',
    'LOT-EXPIRED',
    current_date - interval '1 day',
    20
  );

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_medication_reserve(
    '85000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    5,
    '84000000-0000-0000-0000-000000000001',
    null,
    null,
    'reserve-key-1',
    'reserve-hash-1',
    '81000000-0000-0000-0000-000000000001',
    'req-reserve-1',
    'op-reserve-1',
    'wf-reserve-1'
  )),
  'OK',
  'medication reserve command commits successfully'
);

set local role postgres;

select is(
  (select reserved_quantity::text || ':' || stock::text from public.medications where id = '85000000-0000-0000-0000-000000000001'),
  '5:20',
  'medication reserve increments reserved_quantity without reducing stock'
);

select id as inventory_reservation_id from public.medication_reservations where status = 'active' \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);

select throws_ok(
  format($$
    select * from public.command_medication_dispense(
      '85000000-0000-0000-0000-000000000001',
      '86000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000001',
      %L::uuid,
      5,
      null,
      'dispense-expired-key',
      'dispense-expired-hash',
      '81000000-0000-0000-0000-000000000001',
      'req-dispense-expired',
      'op-dispense-expired',
      'wf-dispense-expired'
    );
  $$, :'inventory_reservation_id'),
  null,
  'Cannot dispense from expired medication batch',
  'medication dispense rejects expired batch'
);

select is(
  (select result_code from public.command_medication_dispense(
    '85000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    :'inventory_reservation_id'::uuid,
    5,
    null,
    'dispense-key-1',
    'dispense-hash-1',
    '81000000-0000-0000-0000-000000000001',
    'req-dispense-1',
    'op-dispense-1',
    'wf-dispense-1'
  )),
  'OK',
  'medication dispense command commits successfully'
);

set local role postgres;

select is(
  (select stock::text || ':' || reserved_quantity::text from public.medications where id = '85000000-0000-0000-0000-000000000001'),
  '15:0',
  'medication dispense reduces stock and clears reserved quantity'
);

select is(
  (select status from public.medication_reservations where id = :'inventory_reservation_id'::uuid),
  'dispensed',
  'medication dispense marks reservation as dispensed'
);

select is(
  (select count(*)::text from public.inventory_movements where medication_id = '85000000-0000-0000-0000-000000000001' and movement_type = 'dispense')
  || ':' ||
  (select sum(quantity)::text from public.inventory_movements where medication_id = '85000000-0000-0000-0000-000000000001' and movement_type = 'dispense'),
  '1:-5',
  'medication dispense writes negative inventory movement'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action_type = 'medication_dispense'
      and details->>'workflow_trace_id' = 'wf-dispense-1'
  ),
  'medication dispense audit includes trace evidence'
);

update public.medications
set stock = 10, reserved_quantity = 0
where id = '85000000-0000-0000-0000-000000000001';

update public.medication_batches
set quantity = 10
where id = '86000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);

select is(
  (select result_code from public.command_medication_reserve(
    '85000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    3,
    '84000000-0000-0000-0000-000000000001',
    null,
    null,
    'reserve-key-2',
    'reserve-hash-2',
    '81000000-0000-0000-0000-000000000001',
    'req-reserve-2',
    'op-reserve-2',
    'wf-reserve-2'
  )),
  'OK',
  'second medication reserve command commits successfully'
);

select id as inventory_release_reservation_id from public.medication_reservations where status = 'active' order by created_at desc limit 1 \gset

select is(
  (select result_code from public.command_medication_release(
    :'inventory_release_reservation_id'::uuid,
    '80000000-0000-0000-0000-000000000001',
    null,
    'release-key-1',
    'release-hash-1',
    '81000000-0000-0000-0000-000000000001',
    'req-release-1',
    'op-release-1',
    'wf-release-1'
  )),
  'OK',
  'medication release command commits successfully'
);

set local role postgres;

select is(
  (select reserved_quantity::text from public.medications where id = '85000000-0000-0000-0000-000000000001'),
  '0',
  'medication release clears reserved quantity'
);

select is(
  (select status from public.medication_reservations where id = :'inventory_release_reservation_id'::uuid),
  'released',
  'medication release marks reservation as released'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '81000000-0000-0000-0000-000000000001', true);

select is(
  (select idempotency_replay from public.command_medication_release(
    :'inventory_release_reservation_id'::uuid,
    '80000000-0000-0000-0000-000000000001',
    null,
    'release-key-1',
    'release-hash-1',
    '81000000-0000-0000-0000-000000000001',
    'req-release-1',
    'op-release-1',
    'wf-release-1'
  )),
  true,
  'medication release idempotency replays without duplicate mutation'
);

select throws_ok(
  $$
    select * from public.command_medication_reserve(
      '85000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000002',
      1,
      null,
      null,
      null,
      'foreign-reserve-key',
      'foreign-reserve-hash',
      '81000000-0000-0000-0000-000000000001',
      'req-foreign-reserve',
      'op-foreign-reserve',
      'wf-foreign-reserve'
    );
  $$,
  '42501',
  'Tenant mismatch for medication reserve command',
  'medication reserve rejects cross-tenant scope'
);

select throws_ok(
  $$
    select * from public.command_medication_reserve(
      '85000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      100,
      null,
      null,
      null,
      'over-reserve-key',
      'over-reserve-hash',
      '81000000-0000-0000-0000-000000000001',
      'req-over-reserve',
      'op-over-reserve',
      'wf-over-reserve'
    );
  $$,
  null,
  'Insufficient available stock for reservation',
  'medication reserve rejects over-allocation'
);

select ok(
  (select stock >= 0 from public.medications where id = '85000000-0000-0000-0000-000000000001'),
  'medication stock never goes negative after inventory commands'
);

select * from finish();
rollback;
