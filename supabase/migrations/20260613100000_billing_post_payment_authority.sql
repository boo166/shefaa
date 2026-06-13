-- Wave D: post-payment billing authority (refund, reversal, write-off)

alter table public.invoices
  add column if not exists amount_refunded numeric(10,2) not null default 0,
  add column if not exists written_off_at timestamptz null,
  add column if not exists write_off_reason text null;

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in (
    'paid', 'pending', 'overdue', 'partially_paid', 'void',
    'partially_refunded', 'refunded', 'written_off'
  ));

alter table public.invoice_payments
  add column if not exists reversed_at timestamptz null,
  add column if not exists reversed_by uuid null references auth.users(id) on delete set null,
  add column if not exists reversal_reason text null;

create table if not exists public.invoice_refunds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  reason text not null,
  reference text null,
  refunded_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_invoice_refunds_tenant_invoice
  on public.invoice_refunds (tenant_id, invoice_id, refunded_at desc);

alter table public.invoice_refunds enable row level security;

drop policy if exists "Billing staff can view invoice refunds" on public.invoice_refunds;
create policy "Billing staff can view invoice refunds"
  on public.invoice_refunds for select to authenticated
  using (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and (
      public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
      or public.has_role(auth.uid(), 'accountant'::public.app_role)
    )
  );

create or replace function public.recalculate_invoice_payment_totals(
  p_invoice_id uuid,
  p_tenant_id uuid
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_active_paid numeric(10,2);
  v_refunded numeric(10,2);
  v_amount_paid numeric(10,2);
  v_balance_due numeric(10,2);
  v_status text;
begin
  select coalesce(sum(ip.amount), 0)
  into v_active_paid
  from public.invoice_payments ip
  where ip.invoice_id = p_invoice_id
    and ip.tenant_id = p_tenant_id
    and ip.reversed_at is null;

  select coalesce(sum(ir.amount), 0)
  into v_refunded
  from public.invoice_refunds ir
  where ir.invoice_id = p_invoice_id
    and ir.tenant_id = p_tenant_id;

  v_amount_paid := round(greatest(v_active_paid - v_refunded, 0), 2);
  v_balance_due := round(greatest(coalesce((select amount from public.invoices where id = p_invoice_id), 0) - v_amount_paid, 0), 2);

  select * into v_invoice from public.invoices where id = p_invoice_id and tenant_id = p_tenant_id for update;

  if v_invoice.written_off_at is not null then
    v_status := 'written_off';
    v_balance_due := 0;
  elsif v_refunded > 0 and v_amount_paid = 0 and v_balance_due >= coalesce(v_invoice.amount, 0) then
    v_status := 'refunded';
  elsif v_refunded > 0 then
    v_status := case when v_amount_paid > 0 then 'partially_refunded' else 'partially_paid' end;
    if v_amount_paid = 0 and v_invoice.due_date is not null and v_invoice.due_date < current_date then
      v_status := 'overdue';
    elsif v_amount_paid = 0 then
      v_status := 'pending';
    end if;
  elsif v_amount_paid >= coalesce(v_invoice.amount, 0) then
    v_status := 'paid';
  elsif v_amount_paid > 0 then
    v_status := 'partially_paid';
  elsif v_invoice.due_date is not null and v_invoice.due_date < current_date then
    v_status := 'overdue';
  else
    v_status := 'pending';
  end if;

  update public.invoices
  set
    amount_paid = v_amount_paid,
    amount_refunded = round(v_refunded, 2),
    balance_due = v_balance_due,
    status = v_status,
    paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = p_invoice_id and tenant_id = p_tenant_id
  returning * into v_invoice;

  return v_invoice;
end;
$function$;

drop function if exists public.command_invoice_refund(
  uuid, uuid, numeric, text, text, text, text, uuid, text, text, text
);

create or replace function public.command_invoice_refund(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_reason text,
  p_reference text default null,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_user_id uuid default null,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  result_code text,
  retryable boolean,
  idempotency_replay boolean,
  message text,
  invoice jsonb,
  refund jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_refund public.invoice_refunds%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_event_id uuid;
  v_total_refunded numeric(10,2);
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for invoice refund command' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be positive';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Refund reason is required';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (tenant_id, operation_type, idempotency_key, request_hash, status, expires_at, request_trace_id, operation_trace_id, workflow_trace_id)
    values (p_tenant_id, 'invoice_refund', p_idempotency_key, coalesce(p_request_hash, ''), 'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id)
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;
    select * into v_idempotency from public.command_idempotency
    where tenant_id = p_tenant_id and operation_type = 'invoice_refund' and idempotency_key = p_idempotency_key for update;
    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;
    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK'; retryable := false; idempotency_replay := true;
      message := 'Invoice refund command replayed';
      invoice := v_idempotency.response_payload->'invoice';
      refund := v_idempotency.response_payload->'refund';
      return next; return;
    end if;
  end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and tenant_id = p_tenant_id and deleted_at is null for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'void' then raise exception 'Voided invoices cannot be refunded'; end if;
  if v_invoice.written_off_at is not null then raise exception 'Written-off invoices cannot be refunded'; end if;
  if coalesce(v_invoice.amount_paid, 0) <= 0 then raise exception 'Invoice has no paid amount to refund'; end if;

  select coalesce(sum(amount), 0) into v_total_refunded from public.invoice_refunds
  where invoice_id = p_invoice_id and tenant_id = p_tenant_id;
  if round(v_total_refunded + p_amount, 2) > round(coalesce(v_invoice.amount_paid, 0) + v_total_refunded, 2) then
    raise exception 'Refund amount exceeds refundable balance';
  end if;
  if round(p_amount, 2) > round(coalesce(v_invoice.amount_paid, 0), 2) then
    raise exception 'Refund amount exceeds paid amount';
  end if;

  insert into public.invoice_refunds (tenant_id, invoice_id, patient_id, amount, reason, reference, created_by)
  values (p_tenant_id, p_invoice_id, v_invoice.patient_id, round(p_amount, 2), trim(p_reason), p_reference, v_actor_id)
  returning * into v_refund;

  v_invoice := public.recalculate_invoice_payment_totals(p_invoice_id, p_tenant_id);

  v_event_id := public.create_domain_event(
    'InvoiceRefunded', 1, 'invoice', p_invoice_id, p_tenant_id, v_actor_id,
    jsonb_build_object('invoiceId', p_invoice_id, 'refundId', v_refund.id, 'amount', v_refund.amount, 'reason', v_refund.reason),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (tenant_id, user_id, actor_id, action, action_type, entity_type, resource_type, entity_id, resource_id, details, metadata, is_global)
  values (
    p_tenant_id, v_actor_id, v_actor_id, 'invoice_refunded', 'invoice_refund',
    'invoice_refund', 'invoice_refund', v_refund.id, v_refund.id,
    jsonb_build_object('invoice_id', p_invoice_id, 'refund_id', v_refund.id, 'amount', v_refund.amount, 'requestTraceId', p_request_trace_id, 'workflowTraceId', p_workflow_trace_id),
    jsonb_build_object('transactional_command', 'command_invoice_refund', 'domain_event_id', v_event_id),
    false
  );

  result_code := 'OK'; retryable := false; idempotency_replay := false; message := 'Refund recorded';
  invoice := to_jsonb(v_invoice); refund := to_jsonb(v_refund);

  if p_idempotency_key is not null then
    update public.command_idempotency set status = 'committed',
      response_payload = jsonb_build_object('invoice', invoice, 'refund', refund, 'domain_event_id', v_event_id), updated_at = now()
    where id = v_idempotency.id;
  end if;
  return next;
end;
$function$;

drop function if exists public.command_invoice_payment_reversal(
  uuid, uuid, text, text, text, uuid, text, text, text
);

create or replace function public.command_invoice_payment_reversal(
  p_payment_id uuid,
  p_tenant_id uuid,
  p_reason text,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_user_id uuid default null,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  result_code text,
  retryable boolean,
  idempotency_replay boolean,
  message text,
  invoice jsonb,
  payment jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_payment public.invoice_payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_event_id uuid;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for payment reversal command' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Payment reversal reason is required';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (tenant_id, operation_type, idempotency_key, request_hash, status, expires_at, request_trace_id, operation_trace_id, workflow_trace_id)
    values (p_tenant_id, 'invoice_payment_reversal', p_idempotency_key, coalesce(p_request_hash, ''), 'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id)
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;
    select * into v_idempotency from public.command_idempotency
    where tenant_id = p_tenant_id and operation_type = 'invoice_payment_reversal' and idempotency_key = p_idempotency_key for update;
    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK'; retryable := false; idempotency_replay := true;
      message := 'Payment reversal command replayed';
      invoice := v_idempotency.response_payload->'invoice';
      payment := v_idempotency.response_payload->'payment';
      return next; return;
    end if;
  end if;

  select * into v_payment from public.invoice_payments
  where id = p_payment_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.reversed_at is not null then raise exception 'Payment already reversed'; end if;

  update public.invoice_payments
  set reversed_at = now(), reversed_by = v_actor_id, reversal_reason = trim(p_reason)
  where id = p_payment_id returning * into v_payment;

  v_invoice := public.recalculate_invoice_payment_totals(v_payment.invoice_id, p_tenant_id);

  v_event_id := public.create_domain_event(
    'PaymentReversed', 1, 'invoice_payment', p_payment_id, p_tenant_id, v_actor_id,
    jsonb_build_object('paymentId', p_payment_id, 'invoiceId', v_payment.invoice_id, 'amount', v_payment.amount, 'reason', p_reason),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (tenant_id, user_id, actor_id, action, action_type, entity_type, resource_type, entity_id, resource_id, details, metadata, is_global)
  values (
    p_tenant_id, v_actor_id, v_actor_id, 'invoice_payment_reversed', 'invoice_payment_reversal',
    'invoice_payment', 'invoice_payment', p_payment_id, p_payment_id,
    jsonb_build_object('payment_id', p_payment_id, 'invoice_id', v_payment.invoice_id, 'amount', v_payment.amount, 'requestTraceId', p_request_trace_id, 'workflowTraceId', p_workflow_trace_id),
    jsonb_build_object('transactional_command', 'command_invoice_payment_reversal', 'domain_event_id', v_event_id),
    false
  );

  result_code := 'OK'; retryable := false; idempotency_replay := false; message := 'Payment reversed';
  invoice := to_jsonb(v_invoice); payment := to_jsonb(v_payment);

  if p_idempotency_key is not null then
    update public.command_idempotency set status = 'committed',
      response_payload = jsonb_build_object('invoice', invoice, 'payment', payment, 'domain_event_id', v_event_id), updated_at = now()
    where id = v_idempotency.id;
  end if;
  return next;
end;
$function$;

drop function if exists public.command_invoice_write_off(
  uuid, uuid, text, text, text, uuid, text, text, text
);

create or replace function public.command_invoice_write_off(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_reason text,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_user_id uuid default null,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  result_code text,
  retryable boolean,
  idempotency_replay boolean,
  message text,
  invoice jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_invoice public.invoices%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_event_id uuid;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for invoice write-off command' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Write-off reason is required';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (tenant_id, operation_type, idempotency_key, request_hash, status, expires_at, request_trace_id, operation_trace_id, workflow_trace_id)
    values (p_tenant_id, 'invoice_write_off', p_idempotency_key, coalesce(p_request_hash, ''), 'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id)
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;
    select * into v_idempotency from public.command_idempotency
    where tenant_id = p_tenant_id and operation_type = 'invoice_write_off' and idempotency_key = p_idempotency_key for update;
    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK'; retryable := false; idempotency_replay := true;
      message := 'Write-off command replayed';
      invoice := v_idempotency.response_payload->'invoice';
      return next; return;
    end if;
  end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and tenant_id = p_tenant_id and deleted_at is null for update;
  if not found then raise exception 'Invoice not found'; end if;
  if v_invoice.status = 'void' then raise exception 'Voided invoices cannot be written off'; end if;
  if v_invoice.written_off_at is not null then raise exception 'Invoice already written off'; end if;
  if coalesce(v_invoice.balance_due, 0) <= 0 then raise exception 'Invoice has no balance to write off'; end if;

  update public.invoices
  set status = 'written_off', balance_due = 0, written_off_at = now(), write_off_reason = trim(p_reason)
  where id = p_invoice_id and tenant_id = p_tenant_id
  returning * into v_invoice;

  v_event_id := public.create_domain_event(
    'InvoiceWrittenOff', 1, 'invoice', p_invoice_id, p_tenant_id, v_actor_id,
    jsonb_build_object('invoiceId', p_invoice_id, 'reason', p_reason, 'balanceWrittenOff', v_invoice.amount - coalesce(v_invoice.amount_paid, 0)),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (tenant_id, user_id, actor_id, action, action_type, entity_type, resource_type, entity_id, resource_id, details, metadata, is_global)
  values (
    p_tenant_id, v_actor_id, v_actor_id, 'invoice_written_off', 'invoice_write_off',
    'invoice', 'invoice', p_invoice_id, p_invoice_id,
    jsonb_build_object('invoice_id', p_invoice_id, 'reason', p_reason, 'requestTraceId', p_request_trace_id, 'workflowTraceId', p_workflow_trace_id),
    jsonb_build_object('transactional_command', 'command_invoice_write_off', 'domain_event_id', v_event_id),
    false
  );

  result_code := 'OK'; retryable := false; idempotency_replay := false; message := 'Invoice written off';
  invoice := to_jsonb(v_invoice);

  if p_idempotency_key is not null then
    update public.command_idempotency set status = 'committed',
      response_payload = jsonb_build_object('invoice', invoice, 'domain_event_id', v_event_id), updated_at = now()
    where id = v_idempotency.id;
  end if;
  return next;
end;
$function$;

grant execute on function public.command_invoice_refund(uuid, uuid, numeric, text, text, text, text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.command_invoice_payment_reversal(uuid, uuid, text, text, text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.command_invoice_write_off(uuid, uuid, text, text, text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.recalculate_invoice_payment_totals(uuid, uuid) to authenticated, service_role;
