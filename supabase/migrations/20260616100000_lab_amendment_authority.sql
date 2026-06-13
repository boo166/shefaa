-- Wave I: lab amendment authority — immutable version history + post-finalization amend command

create table if not exists public.lab_result_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lab_order_id uuid not null references public.lab_orders(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  result text null,
  result_value text null,
  result_unit text null,
  reference_range text null,
  abnormal_flag text null,
  result_notes text null,
  resulted_at timestamptz null,
  amendment_reason text null,
  amended_by uuid null,
  created_at timestamptz not null default now(),
  unique (lab_order_id, version_number)
);

create index if not exists idx_lab_result_versions_tenant_order
  on public.lab_result_versions (tenant_id, lab_order_id, version_number desc);

alter table public.lab_result_versions enable row level security;

drop policy if exists "Tenant users can view lab result versions" on public.lab_result_versions;
create policy "Tenant users can view lab result versions"
on public.lab_result_versions
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

drop function if exists public.command_lab_result_amend(
  uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_lab_result_amend(
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
  lab_order jsonb,
  lab_result_version jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_order public.lab_orders%rowtype;
  v_previous public.lab_orders%rowtype;
  v_version public.lab_result_versions%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_next_version integer;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for lab result amend command' using errcode = '42501';
  end if;

  if p_lab_order_id is null then
    raise exception 'Lab order id is required';
  end if;

  if nullif(trim(coalesce(v_payload->>'result_value', '')), '') is null then
    raise exception 'Lab result amendment requires a structured result value';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'lab_result_amend', p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'lab_result_amend'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Lab result amend replayed';
      lab_order := v_idempotency.response_payload->'lab_order';
      lab_result_version := v_idempotency.response_payload->'lab_result_version';
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

  if v_order.status <> 'completed' then
    raise exception 'Only finalized lab results can be amended';
  end if;

  if p_expected_updated_at is not null and v_order.updated_at <> p_expected_updated_at then
    result_code := 'CONFLICT';
    retryable := true;
    idempotency_replay := false;
    message := 'Lab order was modified by another user';
    lab_order := null;
    lab_result_version := null;
    return next;
    return;
  end if;

  v_previous := v_order;

  select coalesce(max(version_number), 0) + 1
  into v_next_version
  from public.lab_result_versions
  where lab_order_id = v_order.id
    and tenant_id = p_tenant_id;

  insert into public.lab_result_versions (
    tenant_id,
    lab_order_id,
    version_number,
    result,
    result_value,
    result_unit,
    reference_range,
    abnormal_flag,
    result_notes,
    resulted_at,
    amendment_reason,
    amended_by
  )
  values (
    p_tenant_id,
    v_order.id,
    v_next_version,
    v_previous.result,
    v_previous.result_value,
    v_previous.result_unit,
    v_previous.reference_range,
    v_previous.abnormal_flag,
    v_previous.result_notes,
    v_previous.resulted_at,
    nullif(trim(coalesce(v_payload->>'amendment_reason', '')), ''),
    v_actor_id
  )
  returning * into v_version;

  update public.lab_orders
  set
    result = case when v_payload ? 'result' then nullif(trim(coalesce(v_payload->>'result', '')), '') else result end,
    result_value = nullif(trim(coalesce(v_payload->>'result_value', '')), ''),
    result_unit = case when v_payload ? 'result_unit' then nullif(trim(coalesce(v_payload->>'result_unit', '')), '') else result_unit end,
    reference_range = case when v_payload ? 'reference_range' then nullif(trim(coalesce(v_payload->>'reference_range', '')), '') else reference_range end,
    abnormal_flag = case when v_payload ? 'abnormal_flag' then nullif(trim(coalesce(v_payload->>'abnormal_flag', '')), '') else abnormal_flag end,
    result_notes = case when v_payload ? 'result_notes' then nullif(trim(coalesce(v_payload->>'result_notes', '')), '') else result_notes end,
    resulted_at = coalesce(nullif(v_payload->>'resulted_at', '')::timestamptz, resulted_at, now())
  where id = v_order.id
    and tenant_id = p_tenant_id
  returning * into v_order;

  v_event_id := public.create_domain_event(
    'LabResultAmended',
    1,
    'lab_order',
    v_order.id,
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'labOrderId', v_order.id,
      'versionNumber', v_version.version_number,
      'previous', to_jsonb(v_previous),
      'current', to_jsonb(v_order),
      'amendmentReason', v_version.amendment_reason
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
    'lab_result_amended', 'lab_result_amend',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'lab_order', 'lab_order', v_order.id, v_order.id,
    jsonb_build_object(
      'lab_order_id', v_order.id,
      'version_number', v_version.version_number,
      'previous', to_jsonb(v_previous),
      'current', to_jsonb(v_order),
      'amendment_reason', v_version.amendment_reason,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_lab_result_amend'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Lab result amended';
  lab_order := to_jsonb(v_order);
  lab_result_version := to_jsonb(v_version);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object(
        'lab_order', lab_order,
        'lab_result_version', lab_result_version,
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
      'command', 'command_lab_result_amend',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'lab_order_id', v_order.id,
      'version_number', v_version.version_number,
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

revoke all on function public.command_lab_result_amend(uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) from anon;
grant execute on function public.command_lab_result_amend(uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
