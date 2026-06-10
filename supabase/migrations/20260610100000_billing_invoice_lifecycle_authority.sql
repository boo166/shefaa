drop function if exists public.command_invoice_lifecycle(
  text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_invoice_lifecycle(
  p_operation text,
  p_invoice_id uuid default null,
  p_tenant_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_expected_updated_at timestamptz default null,
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
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_invoice public.invoices%rowtype;
  v_previous public.invoices%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_amount numeric(10,2);
  v_amount_paid numeric(10,2);
  v_balance_due numeric(10,2);
  v_status text;
  v_event_type text;
  v_event_id uuid;
  v_started_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for invoice lifecycle command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'update', 'archive', 'restore') then
    raise exception 'Unsupported invoice lifecycle operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'invoice_lifecycle_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'invoice_lifecycle_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Invoice lifecycle command replayed';
      invoice := v_idempotency.response_payload->'invoice';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    if (v_payload->>'patient_id') is null
      or nullif(trim(coalesce(v_payload->>'invoice_code', '')), '') is null
      or nullif(trim(coalesce(v_payload->>'service', '')), '') is null
      or (v_payload->>'amount') is null then
      raise exception 'Invoice create requires patient, code, service, and amount';
    end if;

    if not exists (
      select 1
      from public.patients p
      where p.id = (v_payload->>'patient_id')::uuid
        and p.tenant_id = p_tenant_id
        and p.deleted_at is null
    ) then
      raise exception 'Invoice patient does not belong to tenant' using errcode = '42501';
    end if;

    v_amount := round((v_payload->>'amount')::numeric, 2);
    v_amount_paid := round(coalesce((v_payload->>'amount_paid')::numeric, 0), 2);
    if v_amount < 0 or v_amount_paid < 0 or v_amount_paid > v_amount then
      raise exception 'Invalid invoice amounts';
    end if;
    v_balance_due := round(greatest(v_amount - v_amount_paid, 0), 2);
    v_status := coalesce(nullif(v_payload->>'status', ''), case
      when v_amount_paid >= v_amount then 'paid'
      when v_amount_paid > 0 then 'partially_paid'
      when (v_payload->>'due_date') is not null and (v_payload->>'due_date')::date < current_date then 'overdue'
      else 'pending'
    end);

    if v_status = 'void' then
      raise exception 'New invoices cannot start void';
    end if;

    insert into public.invoices (
      tenant_id, patient_id, invoice_code, service, amount, amount_paid, balance_due,
      invoice_date, due_date, paid_at, status
    )
    values (
      p_tenant_id,
      (v_payload->>'patient_id')::uuid,
      nullif(trim(v_payload->>'invoice_code'), ''),
      nullif(trim(v_payload->>'service'), ''),
      v_amount,
      v_amount_paid,
      v_balance_due,
      coalesce((v_payload->>'invoice_date')::date, current_date),
      case when v_payload ? 'due_date' then nullif(v_payload->>'due_date', '')::date else null end,
      case
        when v_status = 'paid' then coalesce((v_payload->>'paid_at')::timestamptz, now())
        else null
      end,
      v_status
    )
    returning * into v_invoice;

    v_event_type := 'InvoiceCreated';

  else
    if p_invoice_id is null then
      raise exception 'Invoice id is required';
    end if;

    select *
    into v_invoice
    from public.invoices
    where id = p_invoice_id
      and tenant_id = p_tenant_id
      and (v_operation = 'restore' or deleted_at is null)
    for update;

    if not found then
      raise exception 'Invoice not found' using errcode = 'P0002';
    end if;

    if p_expected_updated_at is not null and v_invoice.updated_at <> p_expected_updated_at then
      result_code := 'CONFLICT';
      retryable := true;
      idempotency_replay := false;
      message := 'Invoice was modified by another user';
      invoice := null;
      return next;
      return;
    end if;

    v_previous := v_invoice;

    if v_operation = 'archive' then
      update public.invoices
      set deleted_at = coalesce(deleted_at, now()),
          deleted_by = coalesce((v_payload->>'deleted_by')::uuid, v_actor_id)
      where id = v_invoice.id
        and tenant_id = p_tenant_id
      returning * into v_invoice;
      v_event_type := 'InvoiceArchived';

    elsif v_operation = 'restore' then
      update public.invoices
      set deleted_at = null,
          deleted_by = null
      where id = v_invoice.id
        and tenant_id = p_tenant_id
      returning * into v_invoice;
      v_event_type := 'InvoiceRestored';

    else
      if v_invoice.status in ('paid', 'void') and coalesce(v_payload->>'status', v_invoice.status) <> v_invoice.status then
        raise exception 'Terminal invoices cannot change status';
      end if;

      if v_payload ? 'patient_id' and not exists (
        select 1
        from public.patients p
        where p.id = (v_payload->>'patient_id')::uuid
          and p.tenant_id = p_tenant_id
          and p.deleted_at is null
      ) then
        raise exception 'Invoice patient does not belong to tenant' using errcode = '42501';
      end if;

      v_amount := round(coalesce((v_payload->>'amount')::numeric, v_invoice.amount), 2);
      v_amount_paid := round(coalesce((v_payload->>'amount_paid')::numeric, v_invoice.amount_paid, 0), 2);
      if v_amount < 0 or v_amount_paid < 0 or v_amount_paid > v_amount then
        raise exception 'Invalid invoice amounts';
      end if;

      v_status := coalesce(nullif(v_payload->>'status', ''), case
        when v_amount_paid >= v_amount then 'paid'
        when v_amount_paid > 0 then 'partially_paid'
        when coalesce((v_payload->>'due_date')::date, v_invoice.due_date) is not null
          and coalesce((v_payload->>'due_date')::date, v_invoice.due_date) < current_date then 'overdue'
        else 'pending'
      end);

      if v_status not in ('paid', 'pending', 'overdue', 'partially_paid', 'void') then
        raise exception 'Invalid invoice status';
      end if;

      if v_status = 'void' then
        if exists (
          select 1
          from public.invoice_payments ip
          where ip.invoice_id = v_invoice.id
            and ip.tenant_id = p_tenant_id
        ) or coalesce(v_invoice.amount_paid, 0) > 0 or v_amount_paid > 0 then
          raise exception 'Invoices with posted payments cannot be voided';
        end if;
        if nullif(trim(coalesce(v_payload->>'void_reason', v_invoice.void_reason, '')), '') is null then
          raise exception 'Voided invoices require a reason';
        end if;
        v_balance_due := 0;
      else
        v_balance_due := round(greatest(v_amount - v_amount_paid, 0), 2);
      end if;

      update public.invoices
      set
        patient_id = coalesce((v_payload->>'patient_id')::uuid, patient_id),
        invoice_code = coalesce(nullif(trim(v_payload->>'invoice_code'), ''), invoice_code),
        service = coalesce(nullif(trim(v_payload->>'service'), ''), service),
        amount = v_amount,
        amount_paid = v_amount_paid,
        balance_due = v_balance_due,
        invoice_date = coalesce((v_payload->>'invoice_date')::date, invoice_date),
        due_date = case when v_payload ? 'due_date' then nullif(v_payload->>'due_date', '')::date else due_date end,
        paid_at = case
          when v_status = 'paid' then coalesce((v_payload->>'paid_at')::timestamptz, paid_at, now())
          when v_status = 'void' then null
          when v_payload ? 'paid_at' then nullif(v_payload->>'paid_at', '')::timestamptz
          else paid_at
        end,
        voided_at = case
          when v_status = 'void' then coalesce((v_payload->>'voided_at')::timestamptz, voided_at, now())
          else null
        end,
        void_reason = case
          when v_status = 'void' then nullif(trim(coalesce(v_payload->>'void_reason', void_reason, '')), '')
          else null
        end,
        status = v_status
      where id = v_invoice.id
        and tenant_id = p_tenant_id
      returning * into v_invoice;

      v_event_type := case
        when v_invoice.status = 'void' then 'InvoiceVoided'
        when v_previous.status <> 'paid' and v_invoice.status = 'paid' then 'InvoicePaid'
        else 'InvoiceUpdated'
      end;
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type,
    1,
    'invoice',
    v_invoice.id,
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'invoiceId', v_invoice.id,
      'patientId', v_invoice.patient_id,
      'operation', v_operation,
      'previousStatus', case when v_operation = 'create' then null else v_previous.status end,
      'status', v_invoice.status,
      'amount', v_invoice.amount,
      'amountPaid', v_invoice.amount_paid,
      'balanceDue', v_invoice.balance_due,
      'commandIdempotencyKey', p_idempotency_key
    ),
    p_request_trace_id,
    p_operation_trace_id,
    p_workflow_trace_id,
    null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    case v_event_type
      when 'InvoiceCreated' then 'invoice_created'
      when 'InvoicePaid' then 'invoice_paid'
      when 'InvoiceVoided' then 'invoice_voided'
      when 'InvoiceArchived' then 'invoice_archived'
      when 'InvoiceRestored' then 'invoice_restored'
      else 'invoice_updated'
    end,
    'invoice_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'invoice', 'invoice', v_invoice.id, v_invoice.id,
    jsonb_build_object(
      'invoice_id', v_invoice.id,
      'patient_id', v_invoice.patient_id,
      'operation', v_operation,
      'previous_status', case when v_operation = 'create' then null else v_previous.status end,
      'status', v_invoice.status,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_invoice_lifecycle'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Invoice lifecycle command committed';
  invoice := to_jsonb(v_invoice);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('invoice', invoice, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'billing-transactional-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object(
      'command', 'command_invoice_lifecycle',
      'operation', v_operation,
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'invoice_id', v_invoice.id,
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

revoke all on function public.command_invoice_lifecycle(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) from anon;
grant execute on function public.command_invoice_lifecycle(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
