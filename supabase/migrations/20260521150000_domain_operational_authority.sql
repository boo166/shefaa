drop function if exists public.finalize_lab_result(
  uuid, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.finalize_lab_result(
  p_lab_order_id uuid,
  p_tenant_id uuid,
  p_status text,
  p_result text default null,
  p_result_value text default null,
  p_result_unit text default null,
  p_reference_range text default null,
  p_abnormal_flag text default null,
  p_result_notes text default null,
  p_resulted_at timestamptz default null,
  p_expected_updated_at timestamptz default null,
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
  lab_order jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.lab_orders%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_started_at timestamptz := clock_timestamp();
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for lab result finalization' using errcode = '42501';
  end if;

  if p_lab_order_id is null then
    raise exception 'Lab order id is required';
  end if;

  if coalesce(p_status, '') <> 'completed' then
    raise exception 'Lab result finalization requires completed status';
  end if;

  if nullif(trim(coalesce(p_result_value, '')), '') is null then
    raise exception 'Completed lab results must include a structured result entry';
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
      'lab_result_finalize',
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
      and operation_type = 'lab_result_finalize'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Lab result finalization replayed';
      lab_order := v_idempotency.response_payload->'lab_order';
      return next;
      return;
    end if;
  end if;

  select *
  into v_order
  from public.lab_orders
  where id = p_lab_order_id
    and tenant_id = p_tenant_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Lab order not found' using errcode = 'P0002';
  end if;

  if p_expected_updated_at is not null and v_order.updated_at <> p_expected_updated_at then
    result_code := 'CONFLICT';
    retryable := true;
    idempotency_replay := false;
    message := 'Lab order was modified by another user';
    lab_order := null;
    return next;
    return;
  end if;

  if v_order.status <> 'completed' and v_order.status not in ('pending', 'processing') then
    raise exception 'Cannot complete lab order from current status';
  end if;

  update public.lab_orders
  set
    status = 'completed',
    result = nullif(trim(coalesce(p_result, '')), ''),
    result_value = nullif(trim(coalesce(p_result_value, '')), ''),
    result_unit = nullif(trim(coalesce(p_result_unit, '')), ''),
    reference_range = nullif(trim(coalesce(p_reference_range, '')), ''),
    abnormal_flag = nullif(trim(coalesce(p_abnormal_flag, '')), ''),
    result_notes = nullif(trim(coalesce(p_result_notes, '')), ''),
    resulted_at = coalesce(p_resulted_at, resulted_at, now())
  where id = v_order.id
    and tenant_id = p_tenant_id
  returning * into v_order;

  v_event_id := public.create_domain_event(
    'LabResultUploaded',
    1,
    'lab_order',
    v_order.id,
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'labOrderId', v_order.id,
      'patientId', v_order.patient_id,
      'doctorId', v_order.doctor_id,
      'status', v_order.status
    ),
    p_request_trace_id,
    p_operation_trace_id,
    p_workflow_trace_id,
    null
  );

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
    'lab_result_finalized',
    'lab_result_finalize',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'lab_order',
    'lab_order',
    v_order.id,
    v_order.id,
    jsonb_build_object(
      'lab_order_id', v_order.id,
      'patient_id', v_order.patient_id,
      'doctor_id', v_order.doctor_id,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'finalize_lab_result'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Lab result finalized';
  lab_order := to_jsonb(v_order);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set
      status = 'committed',
      response_payload = jsonb_build_object('lab_order', lab_order, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info',
    'domain-transactional-command',
    'transactional_command.duration',
    p_tenant_id,
    v_actor_id,
    p_request_trace_id,
    jsonb_build_object(
      'command', 'finalize_lab_result',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'lab_order_id', v_order.id,
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

drop function if exists public.transition_insurance_claim(
  uuid, uuid, text, text, text, uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.transition_insurance_claim(
  p_claim_id uuid,
  p_tenant_id uuid,
  p_next_status text,
  p_denial_reason text default null,
  p_payer_reference text default null,
  p_assigned_to_user_id uuid default null,
  p_internal_notes text default null,
  p_payer_notes text default null,
  p_next_follow_up_at timestamptz default null,
  p_expected_updated_at timestamptz default null,
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
  claim jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_claim public.insurance_claims%rowtype;
  v_previous_status text;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_started_at timestamptz := clock_timestamp();
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for insurance transition' using errcode = '42501';
  end if;

  if p_claim_id is null or nullif(trim(coalesce(p_next_status, '')), '') is null then
    raise exception 'Claim id and next status are required';
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
      'insurance_claim_transition',
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
      and operation_type = 'insurance_claim_transition'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Insurance claim transition replayed';
      claim := v_idempotency.response_payload->'claim';
      return next;
      return;
    end if;
  end if;

  select *
  into v_claim
  from public.insurance_claims
  where id = p_claim_id
    and tenant_id = p_tenant_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Insurance claim not found' using errcode = 'P0002';
  end if;

  if p_expected_updated_at is not null and v_claim.updated_at <> p_expected_updated_at then
    result_code := 'CONFLICT';
    retryable := true;
    idempotency_replay := false;
    message := 'Insurance claim was modified by another user';
    claim := null;
    return next;
    return;
  end if;

  v_previous_status := v_claim.status;

  if v_previous_status <> p_next_status and not (
    (v_previous_status = 'draft' and p_next_status = 'submitted') or
    (v_previous_status = 'submitted' and p_next_status in ('processing', 'denied')) or
    (v_previous_status = 'processing' and p_next_status in ('approved', 'denied')) or
    (v_previous_status = 'approved' and p_next_status = 'reimbursed') or
    (v_previous_status = 'denied' and p_next_status = 'draft')
  ) then
    raise exception 'Invalid insurance claim status transition: % -> %', v_previous_status, p_next_status;
  end if;

  if p_next_status = 'denied' and nullif(trim(coalesce(p_denial_reason, '')), '') is null then
    raise exception 'Denied claims require a denial reason';
  end if;

  if p_next_status = 'reimbursed' and nullif(trim(coalesce(p_payer_reference, v_claim.payer_reference, '')), '') is null then
    raise exception 'Reimbursed claims require a payer reference';
  end if;

  if p_assigned_to_user_id is not null and not exists (
    select 1
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.user_id
    where p.user_id = p_assigned_to_user_id
      and p.tenant_id = p_tenant_id
      and ur.role in ('clinic_admin', 'accountant')
  ) then
    raise exception 'Insurance claim assignee must be an accountant or clinic admin in the same tenant';
  end if;

  update public.insurance_claims
  set
    status = p_next_status,
    submitted_at = case
      when p_next_status = 'draft' and v_previous_status = 'denied' then null
      when p_next_status = 'submitted' then coalesce(submitted_at, now())
      else submitted_at
    end,
    processing_started_at = case
      when p_next_status = 'draft' and v_previous_status = 'denied' then null
      when p_next_status = 'processing' then coalesce(processing_started_at, now())
      else processing_started_at
    end,
    approved_at = case
      when p_next_status = 'draft' and v_previous_status = 'denied' then null
      when p_next_status = 'approved' then coalesce(approved_at, now())
      when p_next_status = 'denied' then null
      else approved_at
    end,
    reimbursed_at = case
      when p_next_status = 'draft' and v_previous_status = 'denied' then null
      when p_next_status = 'reimbursed' then coalesce(reimbursed_at, now())
      when p_next_status = 'denied' then null
      else reimbursed_at
    end,
    denial_reason = case
      when p_next_status = 'denied' then nullif(trim(coalesce(p_denial_reason, '')), '')
      when p_next_status in ('submitted', 'processing', 'approved', 'reimbursed') then null
      else denial_reason
    end,
    payer_reference = case
      when p_next_status = 'reimbursed' then nullif(trim(coalesce(p_payer_reference, payer_reference, '')), '')
      when p_payer_reference is not null then nullif(trim(p_payer_reference), '')
      else payer_reference
    end,
    assigned_to_user_id = coalesce(p_assigned_to_user_id, assigned_to_user_id),
    internal_notes = case when p_internal_notes is not null then nullif(trim(p_internal_notes), '') else internal_notes end,
    payer_notes = case when p_payer_notes is not null then nullif(trim(p_payer_notes), '') else payer_notes end,
    next_follow_up_at = case
      when p_next_status = 'submitted' then null
      when p_next_follow_up_at is not null then p_next_follow_up_at
      else next_follow_up_at
    end,
    resubmission_count = case
      when p_next_status = 'draft' and v_previous_status = 'denied' then resubmission_count + 1
      else resubmission_count
    end
  where id = v_claim.id
    and tenant_id = p_tenant_id
  returning * into v_claim;

  v_event_id := public.create_domain_event(
    'InsuranceClaimTransitioned',
    1,
    'insurance_claim',
    v_claim.id,
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'claimId', v_claim.id,
      'patientId', v_claim.patient_id,
      'previousStatus', v_previous_status,
      'status', v_claim.status
    ),
    p_request_trace_id,
    p_operation_trace_id,
    p_workflow_trace_id,
    null
  );

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
    'insurance_claim_transitioned',
    'insurance_claim_transition',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'insurance_claim',
    'insurance_claim',
    v_claim.id,
    v_claim.id,
    jsonb_build_object(
      'claim_id', v_claim.id,
      'previous_status', v_previous_status,
      'status', v_claim.status,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'transition_insurance_claim'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Insurance claim transitioned';
  claim := to_jsonb(v_claim);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set
      status = 'committed',
      response_payload = jsonb_build_object('claim', claim, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info',
    'domain-transactional-command',
    'transactional_command.duration',
    p_tenant_id,
    v_actor_id,
    p_request_trace_id,
    jsonb_build_object(
      'command', 'transition_insurance_claim',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'claim_id', v_claim.id,
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

drop function if exists public.adjust_medication_stock(
  uuid, uuid, integer, text, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.adjust_medication_stock(
  p_medication_id uuid,
  p_tenant_id uuid,
  p_stock integer,
  p_reason text default null,
  p_expected_updated_at timestamptz default null,
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
  medication jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_medication public.medications%rowtype;
  v_previous_stock integer;
  v_status text;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_started_at timestamptz := clock_timestamp();
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for medication stock adjustment' using errcode = '42501';
  end if;

  if p_medication_id is null or p_stock is null then
    raise exception 'Medication id and stock are required';
  end if;

  if p_stock < 0 then
    raise exception 'Medication stock cannot be negative';
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
      'medication_stock_adjust',
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
      and operation_type = 'medication_stock_adjust'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Medication stock adjustment replayed';
      medication := v_idempotency.response_payload->'medication';
      return next;
      return;
    end if;
  end if;

  select *
  into v_medication
  from public.medications
  where id = p_medication_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Medication not found' using errcode = 'P0002';
  end if;

  if p_expected_updated_at is not null and v_medication.updated_at <> p_expected_updated_at then
    result_code := 'CONFLICT';
    retryable := true;
    idempotency_replay := false;
    message := 'Medication was modified by another user';
    medication := null;
    return next;
    return;
  end if;

  v_previous_stock := v_medication.stock;
  v_status := case
    when p_stock <= 0 then 'out_of_stock'
    when p_stock < 50 then 'low_stock'
    else 'in_stock'
  end;

  update public.medications
  set
    stock = p_stock,
    status = v_status
  where id = v_medication.id
    and tenant_id = p_tenant_id
  returning * into v_medication;

  v_event_id := public.create_domain_event(
    'MedicationStockAdjusted',
    1,
    'medication',
    v_medication.id,
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'medicationId', v_medication.id,
      'previousStock', v_previous_stock,
      'stock', v_medication.stock,
      'status', v_medication.status
    ),
    p_request_trace_id,
    p_operation_trace_id,
    p_workflow_trace_id,
    null
  );

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
    'medication_stock_adjusted',
    'medication_stock_adjust',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'medication',
    'medication',
    v_medication.id,
    v_medication.id,
    jsonb_build_object(
      'medication_id', v_medication.id,
      'previous_stock', v_previous_stock,
      'stock', v_medication.stock,
      'status', v_medication.status,
      'reason', p_reason,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'adjust_medication_stock'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Medication stock adjusted';
  medication := to_jsonb(v_medication);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set
      status = 'committed',
      response_payload = jsonb_build_object('medication', medication, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info',
    'domain-transactional-command',
    'transactional_command.duration',
    p_tenant_id,
    v_actor_id,
    p_request_trace_id,
    jsonb_build_object(
      'command', 'adjust_medication_stock',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'medication_id', v_medication.id,
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

grant execute on function public.finalize_lab_result(uuid, uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.transition_insurance_claim(uuid, uuid, text, text, text, uuid, text, text, timestamptz, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.adjust_medication_stock(uuid, uuid, integer, text, timestamptz, text, text, uuid, text, text, text) to authenticated;
