begin;

select plan(11);

set local role postgres;
set local session_replication_role = replica;

truncate
  public.command_idempotency,
  public.audit_logs,
  public.domain_events,
  public.event_outbox,
  public.invoice_payments,
  public.invoices,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '61000000-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'billing-lifecycle@test.com', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values ('60000000-0000-0000-0000-000000000010', 'Invoice Lifecycle Tenant', 'invoice-lifecycle-tenant', 'active', now());

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('62000000-0000-0000-0000-000000000010', '61000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000010', 'Billing Admin');

insert into public.user_roles (id, user_id, role)
values ('63000000-0000-0000-0000-000000000010', '61000000-0000-0000-0000-000000000010', 'clinic_admin');

insert into public.patients (id, tenant_id, patient_code, full_name, status)
values ('64000000-0000-0000-0000-000000000010', '60000000-0000-0000-0000-000000000010', 'PT-LC-1', 'Lifecycle Patient', 'active');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000010', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"61000000-0000-0000-0000-000000000010","role":"authenticated"}', true);

select is((select result_code from public.command_invoice_lifecycle(
  'create', null, '60000000-0000-0000-0000-000000000010',
  jsonb_build_object(
    'patient_id', '64000000-0000-0000-0000-000000000010',
    'invoice_code', 'INV-LC-1',
    'service', 'Consultation',
    'amount', 150,
    'due_date', (current_date + 7)::text
  ),
  null, 'create-1', 'hash-create-1', '61000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000010', 'op-create', 'wf-lifecycle'
)), 'OK', 'create invoice via lifecycle command');

select is(
  (select status from public.invoices where invoice_code = 'INV-LC-1'),
  'pending',
  'created invoice starts pending'
);

select ok(exists (
  select 1 from public.domain_events where event_type = 'InvoiceCreated'
    and tenant_id = '60000000-0000-0000-0000-000000000010'
), 'create emits InvoiceCreated domain event');

select is((select result_code from public.command_invoice_lifecycle(
  'update',
  (select id from public.invoices where invoice_code = 'INV-LC-1'),
  '60000000-0000-0000-0000-000000000010',
  jsonb_build_object('service', 'Extended Consultation', 'amount', 180),
  null, 'update-1', 'hash-update-1', '61000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000011', 'op-update', 'wf-lifecycle'
)), 'OK', 'update invoice via lifecycle command');

select is(
  (select amount::numeric from public.invoices where invoice_code = 'INV-LC-1'),
  180::numeric,
  'update changes invoice amount'
);

select ok((select idempotency_replay from public.command_invoice_lifecycle(
  'create', null, '60000000-0000-0000-0000-000000000010',
  jsonb_build_object(
    'patient_id', '64000000-0000-0000-0000-000000000010',
    'invoice_code', 'INV-LC-1',
    'service', 'Consultation',
    'amount', 150
  ),
  null, 'create-1', 'hash-create-1', '61000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000010', 'op-create', 'wf-lifecycle'
)), 'create replays idempotently');

select is((select result_code from public.command_invoice_lifecycle(
  'archive',
  (select id from public.invoices where invoice_code = 'INV-LC-1'),
  '60000000-0000-0000-0000-000000000010',
  '{}'::jsonb,
  null, 'archive-1', 'hash-archive-1', '61000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000012', 'op-archive', 'wf-lifecycle'
)), 'OK', 'archive invoice via lifecycle command');

select ok(
  (select deleted_at is not null from public.invoices where invoice_code = 'INV-LC-1'),
  'archive sets deleted_at'
);

select is((select result_code from public.command_invoice_lifecycle(
  'restore',
  (select id from public.invoices where invoice_code = 'INV-LC-1'),
  '60000000-0000-0000-0000-000000000010',
  '{}'::jsonb,
  null, 'restore-1', 'hash-restore-1', '61000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000013', 'op-restore', 'wf-lifecycle'
)), 'OK', 'restore invoice via lifecycle command');

select is((select result_code from public.command_invoice_lifecycle(
  'update',
  (select id from public.invoices where invoice_code = 'INV-LC-1'),
  '60000000-0000-0000-0000-000000000010',
  jsonb_build_object('status', 'void', 'void_reason', 'Duplicate entry at reception'),
  null, 'void-1', 'hash-void-1', '61000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000014', 'op-void', 'wf-lifecycle'
)), 'OK', 'void unpaid invoice via lifecycle update');

select is(
  (select status from public.invoices where invoice_code = 'INV-LC-1'),
  'void',
  'voided invoice has void status'
);

select * from finish();
rollback;
