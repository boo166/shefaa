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

drop function if exists public.command_medication(
  text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_medication(
  p_operation text,
  p_medication_id uuid,
  p_tenant_id uuid,
  p_payload jsonb default '{}'::jsonb,
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
  v_previous public.medications%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_event_type text;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
  v_stock integer;
  v_status text;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for medication command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'update', 'remove') then
    raise exception 'Unsupported medication command operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'medication_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'medication_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Medication command replayed';
      medication := v_idempotency.response_payload->'medication';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    v_stock := greatest(coalesce((p_payload->>'stock')::integer, 0), 0);
    v_status := coalesce(nullif(p_payload->>'status', ''), case when v_stock <= 0 then 'out_of_stock' when v_stock < 50 then 'low_stock' else 'in_stock' end);

    insert into public.medications (tenant_id, name, category, stock, unit, price, status)
    values (
      p_tenant_id,
      nullif(trim(coalesce(p_payload->>'name', '')), ''),
      nullif(trim(coalesce(p_payload->>'category', '')), ''),
      v_stock,
      coalesce(nullif(trim(coalesce(p_payload->>'unit', '')), ''), 'tablets'),
      coalesce((p_payload->>'price')::numeric, 0),
      v_status
    )
    returning * into v_medication;

    v_event_type := 'MedicationCreated';
  else
    if p_medication_id is null then
      raise exception 'Medication id is required';
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

    v_previous := v_medication;

    if v_operation = 'remove' then
      delete from public.medications
      where id = v_medication.id
        and tenant_id = p_tenant_id;
      v_event_type := 'MedicationRemoved';
    else
      v_stock := case when p_payload ? 'stock' then greatest((p_payload->>'stock')::integer, 0) else v_medication.stock end;
      v_status := coalesce(
        nullif(p_payload->>'status', ''),
        case when v_stock <= 0 then 'out_of_stock' when v_stock < 50 then 'low_stock' else 'in_stock' end
      );

      update public.medications
      set
        name = case when p_payload ? 'name' then nullif(trim(coalesce(p_payload->>'name', '')), '') else name end,
        category = case when p_payload ? 'category' then nullif(trim(coalesce(p_payload->>'category', '')), '') else category end,
        stock = v_stock,
        unit = case when p_payload ? 'unit' then coalesce(nullif(trim(coalesce(p_payload->>'unit', '')), ''), unit) else unit end,
        price = case when p_payload ? 'price' then coalesce((p_payload->>'price')::numeric, price) else price end,
        status = v_status
      where id = v_medication.id
        and tenant_id = p_tenant_id
      returning * into v_medication;
      v_event_type := 'MedicationUpdated';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type,
    1,
    'medication',
    coalesce(v_medication.id, v_previous.id),
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'medicationId', coalesce(v_medication.id, v_previous.id),
      'operation', v_operation,
      'previous', case when v_operation in ('update', 'remove') then to_jsonb(v_previous) else null end,
      'medication', case when v_operation = 'remove' then to_jsonb(v_previous) else to_jsonb(v_medication) end
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
    p_tenant_id,
    v_actor_id,
    v_actor_id,
    'medication_' || v_operation || 'd',
    'medication_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'medication',
    'medication',
    coalesce(v_medication.id, v_previous.id),
    coalesce(v_medication.id, v_previous.id),
    jsonb_build_object(
      'medication_id', coalesce(v_medication.id, v_previous.id),
      'operation', v_operation,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_medication'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Medication command committed';
  medication := case when v_operation = 'remove' then to_jsonb(v_previous) else to_jsonb(v_medication) end;

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
      'command', 'command_medication',
      'operation', v_operation,
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'medication_id', coalesce(v_medication.id, v_previous.id),
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

drop function if exists public.command_insurance_claim(
  text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_insurance_claim(
  p_operation text,
  p_claim_id uuid,
  p_tenant_id uuid,
  p_payload jsonb default '{}'::jsonb,
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
  v_previous public.insurance_claims%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_event_type text;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for insurance claim command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'update', 'archive', 'restore') then
    raise exception 'Unsupported insurance claim command operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'insurance_claim_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'insurance_claim_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Insurance claim command replayed';
      claim := v_idempotency.response_payload->'claim';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    if nullif(trim(coalesce(p_payload->>'patient_id', '')), '') is null then
      raise exception 'Insurance claim patient is required';
    end if;

    if coalesce(nullif(p_payload->>'status', ''), 'draft') not in ('draft', 'submitted') then
      raise exception 'New insurance claims must start in draft or submitted status';
    end if;

    if (p_payload->>'assigned_to_user_id') is not null and not exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.user_id
      where p.user_id = (p_payload->>'assigned_to_user_id')::uuid
        and p.tenant_id = p_tenant_id
        and ur.role in ('clinic_admin', 'accountant')
    ) then
      raise exception 'Insurance claim assignee must be an accountant or clinic admin in the same tenant';
    end if;

    insert into public.insurance_claims (
      tenant_id, patient_id, provider, service, amount, claim_date, status,
      submitted_at, processing_started_at, approved_at, reimbursed_at, payer_reference,
      denial_reason, assigned_to_user_id, internal_notes, payer_notes,
      last_follow_up_at, next_follow_up_at, resubmission_count
    )
    values (
      p_tenant_id,
      (p_payload->>'patient_id')::uuid,
      nullif(trim(coalesce(p_payload->>'provider', '')), ''),
      nullif(trim(coalesce(p_payload->>'service', '')), ''),
      coalesce((p_payload->>'amount')::numeric, 0),
      coalesce((p_payload->>'claim_date')::date, current_date),
      coalesce(nullif(p_payload->>'status', ''), 'draft'),
      case when coalesce(nullif(p_payload->>'status', ''), 'draft') = 'submitted' then coalesce((p_payload->>'submitted_at')::timestamptz, now()) else null end,
      null,
      null,
      null,
      null,
      null,
      nullif(p_payload->>'assigned_to_user_id', '')::uuid,
      nullif(trim(coalesce(p_payload->>'internal_notes', '')), ''),
      nullif(trim(coalesce(p_payload->>'payer_notes', '')), ''),
      nullif(p_payload->>'last_follow_up_at', '')::timestamptz,
      nullif(p_payload->>'next_follow_up_at', '')::timestamptz,
      coalesce((p_payload->>'resubmission_count')::integer, 0)
    )
    returning * into v_claim;
    v_event_type := 'InsuranceClaimCreated';
  else
    if p_claim_id is null then
      raise exception 'Insurance claim id is required';
    end if;

    select *
    into v_claim
    from public.insurance_claims
    where id = p_claim_id
      and tenant_id = p_tenant_id
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

    v_previous := v_claim;

    if (p_payload->>'assigned_to_user_id') is not null and not exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.user_id
      where p.user_id = (p_payload->>'assigned_to_user_id')::uuid
        and p.tenant_id = p_tenant_id
        and ur.role in ('clinic_admin', 'accountant')
    ) then
      raise exception 'Insurance claim assignee must be an accountant or clinic admin in the same tenant';
    end if;

    if v_operation = 'archive' then
      update public.insurance_claims
      set deleted_at = now(), deleted_by = v_actor_id
      where id = v_claim.id and tenant_id = p_tenant_id
      returning * into v_claim;
      v_event_type := 'InsuranceClaimArchived';
    elsif v_operation = 'restore' then
      update public.insurance_claims
      set deleted_at = null, deleted_by = null
      where id = v_claim.id and tenant_id = p_tenant_id
      returning * into v_claim;
      v_event_type := 'InsuranceClaimRestored';
    else
      update public.insurance_claims
      set
        patient_id = case when p_payload ? 'patient_id' then (p_payload->>'patient_id')::uuid else patient_id end,
        provider = case when p_payload ? 'provider' then nullif(trim(coalesce(p_payload->>'provider', '')), '') else provider end,
        service = case when p_payload ? 'service' then nullif(trim(coalesce(p_payload->>'service', '')), '') else service end,
        amount = case when p_payload ? 'amount' then coalesce((p_payload->>'amount')::numeric, amount) else amount end,
        claim_date = case when p_payload ? 'claim_date' then coalesce((p_payload->>'claim_date')::date, claim_date) else claim_date end,
        assigned_to_user_id = case when p_payload ? 'assigned_to_user_id' then nullif(p_payload->>'assigned_to_user_id', '')::uuid else assigned_to_user_id end,
        internal_notes = case when p_payload ? 'internal_notes' then nullif(trim(coalesce(p_payload->>'internal_notes', '')), '') else internal_notes end,
        payer_notes = case when p_payload ? 'payer_notes' then nullif(trim(coalesce(p_payload->>'payer_notes', '')), '') else payer_notes end,
        last_follow_up_at = case when p_payload ? 'last_follow_up_at' then nullif(p_payload->>'last_follow_up_at', '')::timestamptz else last_follow_up_at end,
        next_follow_up_at = case when p_payload ? 'next_follow_up_at' then nullif(p_payload->>'next_follow_up_at', '')::timestamptz else next_follow_up_at end,
        resubmission_count = case when p_payload ? 'resubmission_count' then coalesce((p_payload->>'resubmission_count')::integer, resubmission_count) else resubmission_count end
      where id = v_claim.id and tenant_id = p_tenant_id
      returning * into v_claim;
      v_event_type := 'InsuranceClaimUpdated';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type, 1, 'insurance_claim', v_claim.id, p_tenant_id, v_actor_id,
    jsonb_build_object('claimId', v_claim.id, 'operation', v_operation, 'previous', to_jsonb(v_previous), 'claim', to_jsonb(v_claim)),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    'insurance_claim_' || v_operation || 'd',
    'insurance_claim_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'insurance_claim', 'insurance_claim', v_claim.id, v_claim.id,
    jsonb_build_object('claim_id', v_claim.id, 'operation', v_operation, 'domain_event_id', v_event_id, 'request_trace_id', p_request_trace_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_insurance_claim'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Insurance claim command committed';
  claim := to_jsonb(v_claim);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('claim', claim, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'domain-transactional-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object('command', 'command_insurance_claim', 'operation', v_operation, 'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer, 'claim_id', v_claim.id, 'domain_event_id', v_event_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id)
  );

  return next;
end;
$function$;

drop function if exists public.command_lab_order(
  text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_lab_order(
  p_operation text,
  p_lab_order_id uuid,
  p_tenant_id uuid,
  p_payload jsonb default '{}'::jsonb,
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
  v_previous public.lab_orders%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_event_type text;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for lab order command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'update', 'archive', 'restore') then
    raise exception 'Unsupported lab order command operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'lab_order_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'lab_order_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Lab order command replayed';
      lab_order := v_idempotency.response_payload->'lab_order';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    insert into public.lab_orders (
      tenant_id, patient_id, doctor_id, test_name, order_date, status,
      result, result_value, result_unit, reference_range, abnormal_flag, result_notes, resulted_at
    )
    values (
      p_tenant_id,
      (p_payload->>'patient_id')::uuid,
      (p_payload->>'doctor_id')::uuid,
      nullif(trim(coalesce(p_payload->>'test_name', '')), ''),
      coalesce((p_payload->>'order_date')::date, current_date),
      coalesce(nullif(p_payload->>'status', ''), 'pending'),
      nullif(trim(coalesce(p_payload->>'result', '')), ''),
      nullif(trim(coalesce(p_payload->>'result_value', '')), ''),
      nullif(trim(coalesce(p_payload->>'result_unit', '')), ''),
      nullif(trim(coalesce(p_payload->>'reference_range', '')), ''),
      nullif(trim(coalesce(p_payload->>'abnormal_flag', '')), ''),
      nullif(trim(coalesce(p_payload->>'result_notes', '')), ''),
      nullif(p_payload->>'resulted_at', '')::timestamptz
    )
    returning * into v_order;
    v_event_type := 'LabOrderCreated';
  else
    if p_lab_order_id is null then
      raise exception 'Lab order id is required';
    end if;

    select *
    into v_order
    from public.lab_orders
    where id = p_lab_order_id
      and tenant_id = p_tenant_id
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

    v_previous := v_order;

    if v_operation = 'archive' then
      update public.lab_orders
      set deleted_at = now(), deleted_by = v_actor_id
      where id = v_order.id and tenant_id = p_tenant_id
      returning * into v_order;
      v_event_type := 'LabOrderArchived';
    elsif v_operation = 'restore' then
      update public.lab_orders
      set deleted_at = null, deleted_by = null
      where id = v_order.id and tenant_id = p_tenant_id
      returning * into v_order;
      v_event_type := 'LabOrderRestored';
    else
      update public.lab_orders
      set
        patient_id = case when p_payload ? 'patient_id' then (p_payload->>'patient_id')::uuid else patient_id end,
        doctor_id = case when p_payload ? 'doctor_id' then (p_payload->>'doctor_id')::uuid else doctor_id end,
        test_name = case when p_payload ? 'test_name' then nullif(trim(coalesce(p_payload->>'test_name', '')), '') else test_name end,
        order_date = case when p_payload ? 'order_date' then coalesce((p_payload->>'order_date')::date, order_date) else order_date end,
        status = case when p_payload ? 'status' then coalesce(nullif(p_payload->>'status', ''), status) else status end
      where id = v_order.id and tenant_id = p_tenant_id
      returning * into v_order;
      v_event_type := 'LabOrderUpdated';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type, 1, 'lab_order', v_order.id, p_tenant_id, v_actor_id,
    jsonb_build_object('labOrderId', v_order.id, 'operation', v_operation, 'previous', to_jsonb(v_previous), 'labOrder', to_jsonb(v_order)),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    'lab_order_' || v_operation || 'd',
    'lab_order_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'lab_order', 'lab_order', v_order.id, v_order.id,
    jsonb_build_object('lab_order_id', v_order.id, 'operation', v_operation, 'domain_event_id', v_event_id, 'request_trace_id', p_request_trace_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_lab_order'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Lab order command committed';
  lab_order := to_jsonb(v_order);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('lab_order', lab_order, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'domain-transactional-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object('command', 'command_lab_order', 'operation', v_operation, 'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer, 'lab_order_id', v_order.id, 'domain_event_id', v_event_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id)
  );

  return next;
end;
$function$;

drop function if exists public.command_purchase_order(
  text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

drop function if exists public.command_supplier(
  text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

drop policy if exists "Tenant users can manage suppliers" on public.suppliers;
drop policy if exists "Tenant users can manage purchase orders" on public.purchase_orders;
drop policy if exists "Tenant users can manage purchase order items" on public.purchase_order_items;
drop policy if exists "Tenant users can manage stock receipts" on public.stock_receipts;
drop policy if exists "Tenant users can manage medication batches" on public.medication_batches;
drop policy if exists "Tenant users can manage inventory movements" on public.inventory_movements;

create policy "Tenant users can view suppliers"
on public.suppliers
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

create policy "Tenant users can view purchase orders"
on public.purchase_orders
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

create policy "Tenant users can view purchase order items"
on public.purchase_order_items
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

create policy "Tenant users can view stock receipts"
on public.stock_receipts
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

create policy "Tenant users can view medication batches"
on public.medication_batches
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

create policy "Tenant users can view inventory movements"
on public.inventory_movements
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

create or replace function public.command_supplier(
  p_operation text,
  p_supplier_id uuid,
  p_tenant_id uuid,
  p_payload jsonb default '{}'::jsonb,
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
  supplier jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_supplier public.suppliers%rowtype;
  v_previous public.suppliers%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_event_type text;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for supplier command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'update', 'archive', 'restore') then
    raise exception 'Unsupported supplier command operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'supplier_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'supplier_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Supplier command replayed';
      supplier := v_idempotency.response_payload->'supplier';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    if nullif(trim(coalesce(p_payload->>'name', '')), '') is null then
      raise exception 'Supplier name is required';
    end if;

    insert into public.suppliers (
      tenant_id, name, contact_name, phone, email, address, status
    )
    values (
      p_tenant_id,
      nullif(trim(coalesce(p_payload->>'name', '')), ''),
      nullif(trim(coalesce(p_payload->>'contact_name', '')), ''),
      nullif(trim(coalesce(p_payload->>'phone', '')), ''),
      nullif(trim(coalesce(p_payload->>'email', '')), ''),
      nullif(trim(coalesce(p_payload->>'address', '')), ''),
      coalesce(nullif(p_payload->>'status', ''), 'active')
    )
    returning * into v_supplier;
    v_event_type := 'SupplierCreated';
  else
    if p_supplier_id is null then
      raise exception 'Supplier id is required';
    end if;

    select *
    into v_supplier
    from public.suppliers
    where id = p_supplier_id
      and tenant_id = p_tenant_id
    for update;

    if not found then
      raise exception 'Supplier not found' using errcode = 'P0002';
    end if;

    if p_expected_updated_at is not null and v_supplier.updated_at <> p_expected_updated_at then
      result_code := 'CONFLICT';
      retryable := true;
      idempotency_replay := false;
      message := 'Supplier was modified by another user';
      supplier := null;
      return next;
      return;
    end if;

    v_previous := v_supplier;

    if v_operation = 'archive' then
      update public.suppliers
      set status = 'inactive',
          updated_at = now()
      where id = v_supplier.id and tenant_id = p_tenant_id
      returning * into v_supplier;
      v_event_type := 'SupplierArchived';
    elsif v_operation = 'restore' then
      update public.suppliers
      set status = 'active',
          updated_at = now()
      where id = v_supplier.id and tenant_id = p_tenant_id
      returning * into v_supplier;
      v_event_type := 'SupplierRestored';
    else
      update public.suppliers
      set
        name = case when p_payload ? 'name' then nullif(trim(coalesce(p_payload->>'name', '')), '') else name end,
        contact_name = case when p_payload ? 'contact_name' then nullif(trim(coalesce(p_payload->>'contact_name', '')), '') else contact_name end,
        phone = case when p_payload ? 'phone' then nullif(trim(coalesce(p_payload->>'phone', '')), '') else phone end,
        email = case when p_payload ? 'email' then nullif(trim(coalesce(p_payload->>'email', '')), '') else email end,
        address = case when p_payload ? 'address' then nullif(trim(coalesce(p_payload->>'address', '')), '') else address end,
        status = case when p_payload ? 'status' then coalesce(nullif(p_payload->>'status', ''), status) else status end,
        updated_at = now()
      where id = v_supplier.id and tenant_id = p_tenant_id
      returning * into v_supplier;
      v_event_type := 'SupplierUpdated';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type, 1, 'supplier', v_supplier.id, p_tenant_id, v_actor_id,
    jsonb_build_object('supplierId', v_supplier.id, 'operation', v_operation, 'previous', to_jsonb(v_previous), 'supplier', to_jsonb(v_supplier)),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    case v_operation
      when 'archive' then 'supplier_archived'
      when 'restore' then 'supplier_restored'
      else 'supplier_' || v_operation || 'd'
    end,
    'supplier_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'supplier', 'supplier', v_supplier.id, v_supplier.id,
    jsonb_build_object('supplier_id', v_supplier.id, 'operation', v_operation, 'domain_event_id', v_event_id, 'request_trace_id', p_request_trace_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_supplier'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Supplier command committed';
  supplier := to_jsonb(v_supplier);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('supplier', supplier, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'domain-transactional-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object('command', 'command_supplier', 'operation', v_operation, 'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer, 'supplier_id', v_supplier.id, 'domain_event_id', v_event_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id)
  );

  return next;
end;
$function$;

create or replace function public.command_purchase_order(
  p_operation text,
  p_purchase_order_id uuid,
  p_tenant_id uuid,
  p_payload jsonb default '{}'::jsonb,
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
  purchase_order jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.purchase_orders%rowtype;
  v_previous public.purchase_orders%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_event_type text;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
  v_item jsonb;
  v_item_total numeric(12,2);
  v_total numeric(12,2) := 0;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for purchase order command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'update', 'submit', 'cancel') then
    raise exception 'Unsupported purchase order command operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'purchase_order_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'purchase_order_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Purchase order command replayed';
      purchase_order := v_idempotency.response_payload->'purchase_order';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    if not exists (
      select 1 from public.suppliers
      where id = (p_payload->>'supplier_id')::uuid
        and tenant_id = p_tenant_id
        and status = 'active'
    ) then
      raise exception 'Supplier not found for tenant' using errcode = 'P0002';
    end if;

    if jsonb_typeof(coalesce(p_payload->'items', '[]'::jsonb)) <> 'array'
      or jsonb_array_length(coalesce(p_payload->'items', '[]'::jsonb)) = 0 then
      raise exception 'Purchase order items are required';
    end if;

    if coalesce(nullif(p_payload->>'status', ''), 'draft') not in ('draft', 'submitted') then
      raise exception 'New purchase orders must start in draft or submitted status';
    end if;

    insert into public.purchase_orders (tenant_id, supplier_id, status, order_date, total_amount, notes)
    values (
      p_tenant_id,
      (p_payload->>'supplier_id')::uuid,
      coalesce(nullif(p_payload->>'status', ''), 'draft'),
      coalesce((p_payload->>'order_date')::date, current_date),
      0,
      nullif(trim(coalesce(p_payload->>'notes', '')), '')
    )
    returning * into v_order;

    for v_item in select * from jsonb_array_elements(p_payload->'items') loop
      if not exists (
        select 1 from public.medications
        where id = (v_item->>'medication_id')::uuid
          and tenant_id = p_tenant_id
      ) then
        raise exception 'Purchase order item medication not found for tenant' using errcode = 'P0002';
      end if;

      if coalesce((v_item->>'quantity')::integer, 0) <= 0 then
        raise exception 'Purchase order item quantity must be positive';
      end if;

      v_item_total := round(
        coalesce((v_item->>'quantity')::integer, 0)::numeric * coalesce((v_item->>'unit_cost')::numeric, 0),
        2
      );
      v_total := v_total + v_item_total;

      insert into public.purchase_order_items (
        tenant_id, purchase_order_id, medication_id, quantity, unit_cost, total_cost
      )
      values (
        p_tenant_id,
        v_order.id,
        (v_item->>'medication_id')::uuid,
        (v_item->>'quantity')::integer,
        coalesce((v_item->>'unit_cost')::numeric, 0),
        v_item_total
      );
    end loop;

    update public.purchase_orders
    set total_amount = v_total
    where id = v_order.id and tenant_id = p_tenant_id
    returning * into v_order;

    v_event_type := 'PurchaseOrderCreated';
  else
    if p_purchase_order_id is null then
      raise exception 'Purchase order id is required';
    end if;

    select *
    into v_order
    from public.purchase_orders
    where id = p_purchase_order_id
      and tenant_id = p_tenant_id
    for update;

    if not found then
      raise exception 'Purchase order not found' using errcode = 'P0002';
    end if;

    if p_expected_updated_at is not null and v_order.updated_at <> p_expected_updated_at then
      result_code := 'CONFLICT';
      retryable := true;
      idempotency_replay := false;
      message := 'Purchase order was modified by another user';
      purchase_order := null;
      return next;
      return;
    end if;

    v_previous := v_order;

    if v_operation = 'submit' then
      if v_order.status <> 'draft' then
        raise exception 'Only draft purchase orders can be submitted';
      end if;
      update public.purchase_orders
      set status = 'submitted'
      where id = v_order.id and tenant_id = p_tenant_id
      returning * into v_order;
      v_event_type := 'PurchaseOrderSubmitted';
    elsif v_operation = 'cancel' then
      if v_order.status = 'received' then
        raise exception 'Received purchase orders cannot be cancelled';
      end if;
      update public.purchase_orders
      set status = 'cancelled'
      where id = v_order.id and tenant_id = p_tenant_id
      returning * into v_order;
      v_event_type := 'PurchaseOrderCancelled';
    else
      if v_order.status <> 'draft' then
        raise exception 'Only draft purchase orders can be updated';
      end if;
      update public.purchase_orders
      set
        order_date = case when p_payload ? 'order_date' then coalesce((p_payload->>'order_date')::date, order_date) else order_date end,
        notes = case when p_payload ? 'notes' then nullif(trim(coalesce(p_payload->>'notes', '')), '') else notes end
      where id = v_order.id and tenant_id = p_tenant_id
      returning * into v_order;
      v_event_type := 'PurchaseOrderUpdated';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type, 1, 'purchase_order', v_order.id, p_tenant_id, v_actor_id,
    jsonb_build_object('purchaseOrderId', v_order.id, 'operation', v_operation, 'previous', to_jsonb(v_previous), 'purchaseOrder', to_jsonb(v_order)),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    case v_operation
      when 'submit' then 'purchase_order_submitted'
      when 'cancel' then 'purchase_order_cancelled'
      else 'purchase_order_' || v_operation || 'd'
    end,
    case v_operation
      when 'submit' then 'purchase_order_submit'
      when 'cancel' then 'purchase_order_cancel'
      else 'purchase_order_' || v_operation
    end,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'purchase_order', 'purchase_order', v_order.id, v_order.id,
    jsonb_build_object('purchase_order_id', v_order.id, 'operation', v_operation, 'domain_event_id', v_event_id, 'request_trace_id', p_request_trace_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_purchase_order'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Purchase order command committed';
  purchase_order := to_jsonb(v_order);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('purchase_order', purchase_order, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'domain-transactional-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object('command', 'command_purchase_order', 'operation', v_operation, 'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer, 'purchase_order_id', v_order.id, 'domain_event_id', v_event_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id)
  );

  return next;
end;
$function$;

drop function if exists public.receive_procurement_stock(
  uuid, uuid, uuid, integer, text, date, timestamptz, text, text, text, uuid, text, text, text
);

create or replace function public.receive_procurement_stock(
  p_purchase_order_id uuid,
  p_purchase_order_item_id uuid,
  p_tenant_id uuid,
  p_quantity integer,
  p_lot_number text,
  p_expiry_date date default null,
  p_received_at timestamptz default now(),
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
  purchase_order jsonb,
  stock_receipt jsonb,
  medication_batch jsonb,
  inventory_movement jsonb,
  medication jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.purchase_orders%rowtype;
  v_item public.purchase_order_items%rowtype;
  v_supplier public.suppliers%rowtype;
  v_medication public.medications%rowtype;
  v_receipt public.stock_receipts%rowtype;
  v_batch public.medication_batches%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
  v_status text;
  v_received_quantity integer;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for procurement stock receipt' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Received quantity must be positive';
  end if;

  if nullif(trim(coalesce(p_lot_number, '')), '') is null then
    raise exception 'Lot number is required';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'procurement_stock_receive', p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'procurement_stock_receive'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Procurement stock receipt replayed';
      purchase_order := v_idempotency.response_payload->'purchase_order';
      stock_receipt := v_idempotency.response_payload->'stock_receipt';
      medication_batch := v_idempotency.response_payload->'medication_batch';
      inventory_movement := v_idempotency.response_payload->'inventory_movement';
      medication := v_idempotency.response_payload->'medication';
      return next;
      return;
    end if;
  end if;

  select *
  into v_order
  from public.purchase_orders
  where id = p_purchase_order_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Purchase order not found' using errcode = 'P0002';
  end if;

  if v_order.status not in ('submitted', 'draft') then
    raise exception 'Purchase order cannot receive stock in current status';
  end if;

  select *
  into v_item
  from public.purchase_order_items
  where id = p_purchase_order_item_id
    and purchase_order_id = p_purchase_order_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Purchase order item not found' using errcode = 'P0002';
  end if;

  select *
  into v_supplier
  from public.suppliers
  where id = v_order.supplier_id
    and tenant_id = p_tenant_id;

  if not found then
    raise exception 'Supplier not found for tenant' using errcode = 'P0002';
  end if;

  select *
  into v_medication
  from public.medications
  where id = v_item.medication_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Medication not found for tenant' using errcode = 'P0002';
  end if;

  select coalesce(sum(quantity), 0)::integer
  into v_received_quantity
  from public.inventory_movements
  where tenant_id = p_tenant_id
    and medication_id = v_item.medication_id
    and movement_type = 'receipt'
    and source_reference like 'purchase_order:' || p_purchase_order_id::text || ':item:' || p_purchase_order_item_id::text || ':%';

  if v_received_quantity + p_quantity > v_item.quantity then
    raise exception 'Received quantity exceeds purchase order item quantity';
  end if;

  insert into public.stock_receipts (tenant_id, purchase_order_id, received_at, received_by, notes)
  values (p_tenant_id, p_purchase_order_id, coalesce(p_received_at, now()), v_actor_id, nullif(trim(coalesce(p_notes, '')), ''))
  returning * into v_receipt;

  insert into public.medication_batches (
    tenant_id, medication_id, supplier_id, lot_number, expiry_date, quantity, cost_price, received_at
  )
  values (
    p_tenant_id, v_item.medication_id, v_order.supplier_id, nullif(trim(p_lot_number), ''),
    p_expiry_date, p_quantity, v_item.unit_cost, coalesce(p_received_at, now())
  )
  returning * into v_batch;

  insert into public.inventory_movements (
    tenant_id, medication_id, batch_id, movement_type, quantity, source_reference
  )
  values (
    p_tenant_id, v_item.medication_id, v_batch.id, 'receipt', p_quantity,
    'purchase_order:' || p_purchase_order_id::text || ':item:' || p_purchase_order_item_id::text || ':receipt:' || v_receipt.id::text
  )
  returning * into v_movement;

  v_status := case
    when v_medication.stock + p_quantity <= 0 then 'out_of_stock'
    when v_medication.stock + p_quantity < 50 then 'low_stock'
    else 'in_stock'
  end;

  update public.medications
  set stock = stock + p_quantity,
      status = v_status
  where id = v_medication.id
    and tenant_id = p_tenant_id
  returning * into v_medication;

  select coalesce(sum(quantity), 0)::integer
  into v_received_quantity
  from public.inventory_movements
  where tenant_id = p_tenant_id
    and medication_id = v_item.medication_id
    and movement_type = 'receipt'
    and source_reference like 'purchase_order:' || p_purchase_order_id::text || ':item:' || p_purchase_order_item_id::text || ':%';

  if v_received_quantity >= v_item.quantity then
    update public.purchase_orders
    set status = 'received'
    where id = v_order.id and tenant_id = p_tenant_id
    returning * into v_order;
  end if;

  v_event_id := public.create_domain_event(
    'ProcurementStockReceived', 1, 'stock_receipt', v_receipt.id, p_tenant_id, v_actor_id,
    jsonb_build_object(
      'purchaseOrderId', v_order.id,
      'purchaseOrderItemId', v_item.id,
      'stockReceiptId', v_receipt.id,
      'batchId', v_batch.id,
      'movementId', v_movement.id,
      'medicationId', v_medication.id,
      'quantity', p_quantity,
      'lotNumber', v_batch.lot_number,
      'purchaseOrderStatus', v_order.status
    ),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    'procurement_stock_received', 'procurement_stock_receive',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'stock_receipt', 'stock_receipt', v_receipt.id, v_receipt.id,
    jsonb_build_object(
      'purchase_order_id', v_order.id,
      'purchase_order_item_id', v_item.id,
      'stock_receipt_id', v_receipt.id,
      'batch_id', v_batch.id,
      'movement_id', v_movement.id,
      'medication_id', v_medication.id,
      'quantity', p_quantity,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'receive_procurement_stock'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Procurement stock received';
  purchase_order := to_jsonb(v_order);
  stock_receipt := to_jsonb(v_receipt);
  medication_batch := to_jsonb(v_batch);
  inventory_movement := to_jsonb(v_movement);
  medication := to_jsonb(v_medication);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object(
        'purchase_order', purchase_order,
        'stock_receipt', stock_receipt,
        'medication_batch', medication_batch,
        'inventory_movement', inventory_movement,
        'medication', medication,
        'domain_event_id', v_event_id
      ),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'domain-transactional-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object(
      'command', 'receive_procurement_stock',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'purchase_order_id', v_order.id,
      'stock_receipt_id', v_receipt.id,
      'batch_id', v_batch.id,
      'movement_id', v_movement.id,
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
grant execute on function public.command_medication(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.command_insurance_claim(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.command_lab_order(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.command_supplier(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.command_purchase_order(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.receive_procurement_stock(uuid, uuid, uuid, integer, text, date, timestamptz, text, text, text, uuid, text, text, text) to authenticated;
