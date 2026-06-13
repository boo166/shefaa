begin;

select plan(4);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.billing_reconciliation_findings,
  public.billing_reconciliation_runs,
  public.command_idempotency,
  public.invoice_payments,
  public.invoices,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '91000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'load-billing@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('90000000-0000-0000-0000-000000000001', 'Load Billing Tenant', 'load-billing', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('92000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'Load Billing User');

insert into public.user_roles (id, user_id, role)
values ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('94000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'LOAD-P1', 'Load Patient', 'active');

insert into public.invoices (id, tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due, status, invoice_date)
values ('95000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'INV-LOAD', 'Load Test', 1000, 0, 1000, 'pending', current_date);

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '91000000-0000-0000-0000-000000000001', true);

do $$
declare
  i integer;
  v_result text;
begin
  for i in 1..100 loop
    select result_code into v_result from public.post_invoice_payment(
      '95000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-000000000001',
      1,
      'cash',
      now(),
      format('RCPT-%s', i),
      null,
      format('load-pay-%s', i),
      format('hash-%s', i),
      '91000000-0000-0000-0000-000000000001',
      format('req-%s', i),
      format('op-%s', i),
      'wf-load-billing'
    );
    if v_result <> 'OK' then
      raise exception 'Payment % failed with %', i, v_result;
    end if;
  end loop;
end $$;

select is(
  (select count(*) from public.invoice_payments where invoice_id = '95000000-0000-0000-0000-000000000001'),
  100::bigint,
  '100 sequential payments create exactly 100 payment rows'
);

select is(
  (select amount_paid::numeric from public.invoices where id = '95000000-0000-0000-0000-000000000001'),
  100::numeric,
  'invoice amount_paid matches summed partial payments'
);

select is(
  (select critical_count from public.run_billing_reconciliation(
    '90000000-0000-0000-0000-000000000001',
    now() - interval '1 day',
    now() + interval '1 day',
    true
  )),
  0::bigint,
  'reconciliation stays clean after payment load'
);

select ok(
  (select count(*) from public.command_idempotency where operation_type = 'invoice_payment_post') = 100,
  'each payment retains idempotency evidence'
);

select * from finish();
rollback;
