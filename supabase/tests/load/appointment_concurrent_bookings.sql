begin;

select plan(3);

set local role postgres;
set local session_replication_role = replica;

truncate public.appointments, public.doctors, public.patients, public.user_roles, public.profiles, public.tenants restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'load-appt@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('90000000-0000-0000-0000-000000000002', 'Load Appt Tenant', 'load-appt', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('92000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'Load Appt User');

insert into public.user_roles (id, user_id, role)
values ('93000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('94000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'LOAD-A1', 'Load Appt Patient', 'active');

insert into public.doctors (id, tenant_id, user_id, full_name, specialty, status)
values ('95000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000002', 'Load Doctor', 'General', 'available');

set local session_replication_role = origin;

do $$
declare
  i integer;
  v_slot timestamptz := date_trunc('hour', now()) + interval '2 days';
  v_inserted integer := 0;
  v_conflict integer := 0;
begin
  for i in 1..50 loop
    begin
      insert into public.appointments (tenant_id, patient_id, doctor_id, appointment_date, appointment_range, status, type)
      values (
        '90000000-0000-0000-0000-000000000002',
        '94000000-0000-0000-0000-000000000002',
        '95000000-0000-0000-0000-000000000002',
        v_slot,
        tstzrange(v_slot, v_slot + interval '30 minutes'),
        'scheduled',
        'checkup'
      );
      v_inserted := v_inserted + 1;
    exception when exclusion_violation then
      v_conflict := v_conflict + 1;
    end;
  end loop;

  if v_inserted <> 1 then
    raise exception 'Expected exactly one booking winner, got %', v_inserted;
  end if;
  if v_conflict <> 49 then
    raise exception 'Expected 49 booking conflicts, got %', v_conflict;
  end if;
end $$;

select is(
  (select count(*) from public.appointments where tenant_id = '90000000-0000-0000-0000-000000000002'),
  1::bigint,
  'overlap constraint allows exactly one winner for concurrent slot attempts'
);

select ok(true, 'concurrent booking load completed without overlap violations');

select ok(
  not exists (
    select 1
    from public.appointments a1
    join public.appointments a2 on a1.id <> a2.id and a1.doctor_id = a2.doctor_id
    where a1.appointment_range && a2.appointment_range
  ),
  'no overlapping appointment ranges remain in tenant'
);

select * from finish();
rollback;
