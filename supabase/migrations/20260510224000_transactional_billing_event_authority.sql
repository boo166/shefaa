create or replace function public.create_domain_event(
  p_event_type text,
  p_event_version integer,
  p_entity_type text,
  p_entity_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null,
  p_runtime_transition_trace_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_event_id uuid;
begin
  if p_tenant_id is null then
    raise exception 'Domain event tenant_id is required';
  end if;

  if nullif(trim(p_event_type), '') is null then
    raise exception 'Domain event type is required';
  end if;

  insert into public.domain_events (
    event_type,
    event_version,
    entity_type,
    entity_id,
    tenant_id,
    user_id,
    payload,
    request_trace_id,
    operation_trace_id,
    workflow_trace_id,
    runtime_transition_trace_id
  )
  values (
    p_event_type,
    coalesce(p_event_version, 1),
    coalesce(nullif(trim(p_entity_type), ''), p_event_type),
    p_entity_id,
    p_tenant_id,
    p_user_id,
    coalesce(p_payload, '{}'::jsonb),
    p_request_trace_id,
    p_operation_trace_id,
    p_workflow_trace_id,
    p_runtime_transition_trace_id
  )
  returning id into v_event_id;

  return v_event_id;
end;
$function$;

revoke all on function public.create_domain_event(text, integer, text, uuid, uuid, uuid, jsonb, text, text, text, text) from anon, authenticated;

drop function if exists public.post_invoice_payment(
  uuid, uuid, numeric, text, timestamptz, text, text, text, text, uuid, text, text, text
);

create or replace function public.post_invoice_payment(
  p_invoice_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_paid_at timestamptz default now(),
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_user_id uuid default auth.uid(),
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
  v_invoice public.invoices%rowtype;
  v_payment public.invoice_payments%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_amount_paid numeric(10,2);
  v_balance_due numeric(10,2);
  v_status text;
  v_paid_at timestamptz;
  v_event_id uuid;
  v_started_at timestamptz := clock_timestamp();
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for payment operation' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id,
      operation_type,
      idempotency_key,
      request_hash,
      status,
      expires_at,
      request_trace_id,
      operation_trace_id,
      workflow_trace_id
    )
    values (
      p_tenant_id,
      'invoice_payment_post',
      p_idempotency_key,
      coalesce(p_request_hash, ''),
      'started',
      now() + interval '7 days',
      p_request_trace_id,
      p_operation_trace_id,
      p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'invoice_payment_post'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      insert into public.system_logs (
        level,
        service,
        message,
        tenant_id,
        user_id,
        request_id,
        metadata
      )
      values (
        'warn',
        'billing-transactional-command',
        'event.replay.command_rejected',
        p_tenant_id,
        v_actor_id,
        p_request_trace_id,
        jsonb_build_object(
          'operation_type', 'invoice_payment_post',
          'idempotency_key', p_idempotency_key,
          'reason', 'IDEMPOTENCY_MISMATCH',
          'operation_trace_id', p_operation_trace_id,
          'workflow_trace_id', p_workflow_trace_id
        )
      );

      result_code := 'IDEMPOTENCY_MISMATCH';
      retryable := false;
      idempotency_replay := false;
      message := 'Idempotency key already used with different payload';
      invoice := null;
      payment := null;
      return next;
      return;
    end if;

    if v_idempotency.status = 'committed' then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Replay of previously committed command';
      invoice := coalesce(v_idempotency.response_payload->'invoice', null);
      payment := coalesce(v_idempotency.response_payload->'payment', null);
      return next;
      return;
    end if;
  end if;

  select *
  into v_invoice
  from public.invoices
  where id = p_invoice_id
    and tenant_id = p_tenant_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_invoice.status = 'void' then
    raise exception 'Voided invoices cannot accept payments';
  end if;

  if v_invoice.status = 'paid' or coalesce(v_invoice.balance_due, 0) <= 0 then
    raise exception 'Paid invoices cannot accept additional payments';
  end if;

  if round(p_amount::numeric, 2) > coalesce(v_invoice.balance_due, 0) then
    raise exception 'Payment amount cannot exceed outstanding balance';
  end if;

  insert into public.invoice_payments (
    tenant_id,
    invoice_id,
    patient_id,
    amount,
    payment_method,
    paid_at,
    reference,
    notes,
    created_by
  )
  values (
    p_tenant_id,
    v_invoice.id,
    v_invoice.patient_id,
    round(p_amount::numeric, 2),
    p_payment_method,
    coalesce(p_paid_at, now()),
    p_reference,
    p_notes,
    v_actor_id
  )
  returning * into v_payment;

  v_amount_paid := round(coalesce(v_invoice.amount_paid, 0) + v_payment.amount, 2);
  v_balance_due := round(greatest(coalesce(v_invoice.amount, 0) - v_amount_paid, 0), 2);
  v_paid_at := case
    when v_amount_paid >= coalesce(v_invoice.amount, 0) then coalesce(v_payment.paid_at, now())
    else v_invoice.paid_at
  end;

  v_status := case
    when v_amount_paid >= coalesce(v_invoice.amount, 0) then 'paid'
    when v_amount_paid > 0 then 'partially_paid'
    when v_invoice.due_date is not null and v_invoice.due_date < current_date then 'overdue'
    else 'pending'
  end;

  update public.invoices
  set
    amount_paid = v_amount_paid,
    balance_due = v_balance_due,
    status = v_status,
    paid_at = v_paid_at
  where id = v_invoice.id
    and tenant_id = p_tenant_id
  returning * into v_invoice;

  if v_status = 'paid' then
    v_event_id := public.create_domain_event(
      'InvoicePaid',
      1,
      'invoice',
      v_invoice.id,
      p_tenant_id,
      v_actor_id,
      jsonb_build_object(
        'invoiceId', v_invoice.id,
        'patientId', v_invoice.patient_id,
        'paymentId', v_payment.id,
        'amount', v_payment.amount,
        'commandIdempotencyKey', p_idempotency_key
      ),
      p_request_trace_id,
      p_operation_trace_id,
      p_workflow_trace_id,
      null
    );
  end if;

  insert into public.audit_logs (
    tenant_id,
    user_id,
    actor_id,
    action,
    action_type,
    request_id,
    entity_type,
    resource_type,
    entity_id,
    resource_id,
    details,
    metadata,
    is_global
  )
  values (
    p_tenant_id,
    v_actor_id,
    v_actor_id,
    'invoice_payment_posted',
    'invoice_payment_create',
    case
      when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then p_request_trace_id::uuid
      else null
    end,
    'invoice_payment',
    'invoice_payment',
    v_payment.id,
    v_payment.id,
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'payment_id', v_payment.id,
      'amount', v_payment.amount,
      'payment_method', v_payment.payment_method,
      'invoice_status', v_invoice.status,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object(
      'domain_event_id', v_event_id,
      'transactional_command', 'post_invoice_payment'
    ),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Payment posted';
  invoice := to_jsonb(v_invoice);
  payment := to_jsonb(v_payment);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set
      status = 'committed',
      response_payload = jsonb_build_object(
        'invoice', invoice,
        'payment', payment,
        'domain_event_id', v_event_id
      ),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (
    level,
    service,
    message,
    tenant_id,
    user_id,
    request_id,
    metadata
  )
  values (
    'info',
    'billing-transactional-command',
    'transactional_command.duration',
    p_tenant_id,
    v_actor_id,
    p_request_trace_id,
    jsonb_build_object(
      'command', 'post_invoice_payment',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'invoice_id', v_invoice.id,
      'payment_id', v_payment.id,
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;
