begin;

select plan(3);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.command_idempotency,
  public.notifications,
  public.audit_logs,
  public.event_outbox,
  public.domain_events,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'load-notif@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'load-notif-user@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('90000000-0000-0000-0000-000000000004', 'Load Notification Tenant', 'load-notif', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values
  ('92000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000004', 'Load Notif Admin'),
  ('92000000-0000-0000-0000-000000000005', '91000000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000004', 'Load Notif User');

insert into public.user_roles (id, user_id, role)
values ('93000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000004', 'clinic_admin');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000004', true);

do $$
declare
  i integer;
  v_result text;
begin
  for i in 1..50 loop
    select result_code into v_result from public.command_notification_delivery(
      '90000000-0000-0000-0000-000000000004',
      '91000000-0000-0000-0000-000000000005',
      format('Load notification %s', i),
      jsonb_build_object('index', i),
      'system_event',
      format('load-delivery-key-%s', i),
      null,
      null,
      false,
      null,
      format('hash-del-%s', i),
      '91000000-0000-0000-0000-000000000004',
      format('req-del-%s', i),
      format('op-del-%s', i),
      'wf-load-notif'
    );
    if v_result <> 'OK' then
      raise exception 'Delivery % failed with %', i, v_result;
    end if;
  end loop;
end $$;

select is(
  (select count(*) from public.notifications where tenant_id = '90000000-0000-0000-0000-000000000004'),
  50::bigint,
  '50 notification deliveries create notification rows'
);

select is(
  (select count(distinct delivery_key) from public.notifications where tenant_id = '90000000-0000-0000-0000-000000000004'),
  50::bigint,
  'delivery keys remain unique under throughput load'
);

select is(
  (select critical_count from public.run_notification_reconciliation(
    '90000000-0000-0000-0000-000000000004',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  )),
  0::bigint,
  'notification reconciliation stays clean after delivery load'
);

select * from finish();
rollback;
