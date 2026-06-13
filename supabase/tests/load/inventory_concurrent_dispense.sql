begin;

select plan(3);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.command_idempotency,
  public.medication_reservations,
  public.inventory_movements,
  public.medication_batches,
  public.medications,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'load-inv@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('90000000-0000-0000-0000-000000000003', 'Load Inventory Tenant', 'load-inventory', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('92000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 'Load Inv User');

insert into public.user_roles (id, user_id, role)
values ('93000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000003', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('94000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 'LOAD-I1', 'Load Inv Patient', 'active');

insert into public.medications (id, tenant_id, name, category, stock, reserved_quantity, unit, price, status)
values ('95000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', 'Load Med', 'General', 200, 0, 'units', 1, 'in_stock');

insert into public.medication_batches (id, tenant_id, medication_id, batch_number, quantity, expiry_date)
values ('96000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000003', '95000000-0000-0000-0000-000000000003', 'B-LOAD', 200, current_date + 365);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000003', true);

do $$
declare
  i integer;
  v_reservation_id uuid;
  v_result text;
begin
  for i in 1..20 loop
    select result_code into v_result from public.command_medication_reserve(
      '95000000-0000-0000-0000-000000000003',
      '90000000-0000-0000-0000-000000000003',
      1,
      '94000000-0000-0000-0000-000000000003',
      null,
      null,
      format('load-res-%s', i),
      format('hash-res-%s', i),
      '91000000-0000-0000-0000-000000000003',
      format('req-res-%s', i),
      format('op-res-%s', i),
      'wf-load-inv'
    );
    if v_result <> 'OK' then
      raise exception 'Reserve % failed', i;
    end if;

    select id into v_reservation_id
    from public.medication_reservations
    where tenant_id = '90000000-0000-0000-0000-000000000003'
    order by created_at desc
    limit 1;

    select result_code into v_result from public.command_medication_dispense(
      '95000000-0000-0000-0000-000000000003',
      '96000000-0000-0000-0000-000000000003',
      '90000000-0000-0000-0000-000000000003',
      v_reservation_id,
      1,
      null,
      format('load-disp-%s', i),
      format('hash-disp-%s', i),
      '91000000-0000-0000-0000-000000000003',
      format('req-disp-%s', i),
      format('op-disp-%s', i),
      'wf-load-inv'
    );
    if v_result <> 'OK' then
      raise exception 'Dispense % failed', i;
    end if;
  end loop;
end $$;

select ok(
  (select stock >= 0 from public.medications where id = '95000000-0000-0000-0000-000000000003'),
  'medication stock never negative after dispense load'
);

select is(
  (select stock from public.medications where id = '95000000-0000-0000-0000-000000000003'),
  180,
  'twenty unit dispense load reduces stock correctly'
);

select is(
  (select count(*) from public.inventory_movements where medication_id = '95000000-0000-0000-0000-000000000003' and movement_type = 'dispense'),
  20::bigint,
  'each dispense writes inventory movement evidence'
);

select * from finish();
rollback;
