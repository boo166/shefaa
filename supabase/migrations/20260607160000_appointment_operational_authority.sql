drop function if exists public.command_appointment_lifecycle(
  text, uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text
);

alter table public.appointment_queue
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists update_appointment_queue_updated_at on public.appointment_queue;
create trigger update_appointment_queue_updated_at
  before update on public.appointment_queue
  for each row execute function public.update_updated_at_column();

create or replace function public.command_appointment_lifecycle(
  p_operation text,
  p_appointment_id uuid default null,
  p_queue_id uuid default null,
  p_tenant_id uuid default null,
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
  appointment jsonb,
  queue_entry jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_appointment public.appointments%rowtype;
  v_previous_appointment public.appointments%rowtype;
  v_queue public.appointment_queue%rowtype;
  v_previous_queue public.appointment_queue%rowtype;
  v_existing_queue public.appointment_queue%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_event_id uuid;
  v_now timestamptz := now();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for appointment lifecycle command' using errcode = '42501';
  end if;

  if v_operation not in ('check_in', 'call', 'wait', 'start', 'complete', 'no_show', 'cancel') then
    raise exception 'Unsupported appointment lifecycle operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'appointment_lifecycle_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'appointment_lifecycle_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Appointment lifecycle command replayed';
      appointment := v_idempotency.response_payload->'appointment';
      queue_entry := v_idempotency.response_payload->'queue_entry';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'check_in' then
    if p_appointment_id is null then
      raise exception 'Appointment id is required';
    end if;

    select *
    into v_appointment
    from public.appointments
    where id = p_appointment_id
      and tenant_id = p_tenant_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'Appointment not found' using errcode = 'P0002';
    end if;

    if v_appointment.status <> 'scheduled' then
      raise exception 'Only scheduled appointments can be checked in';
    end if;

    select *
    into v_existing_queue
    from public.appointment_queue
    where appointment_id = v_appointment.id
      and tenant_id = p_tenant_id
    for update;

    if found then
      raise exception 'Appointment is already checked in' using errcode = '23505';
    end if;

    insert into public.appointment_queue (appointment_id, tenant_id, status)
    values (v_appointment.id, p_tenant_id, 'waiting')
    returning * into v_queue;

  elsif v_operation = 'cancel' then
    if p_appointment_id is null then
      raise exception 'Appointment id is required';
    end if;

    select *
    into v_appointment
    from public.appointments
    where id = p_appointment_id
      and tenant_id = p_tenant_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'Appointment not found' using errcode = 'P0002';
    end if;

    if p_expected_updated_at is not null and v_appointment.updated_at <> p_expected_updated_at then
      result_code := 'CONFLICT';
      retryable := true;
      idempotency_replay := false;
      message := 'Appointment was modified by another user';
      appointment := null;
      queue_entry := null;
      return next;
      return;
    end if;

    if v_appointment.status in ('completed', 'cancelled', 'no_show') then
      raise exception 'Cannot cancel terminal appointment';
    end if;

    v_previous_appointment := v_appointment;
    update public.appointments
    set status = 'cancelled'
    where id = v_appointment.id
      and tenant_id = p_tenant_id
    returning * into v_appointment;

    select *
    into v_queue
    from public.appointment_queue
    where appointment_id = v_appointment.id
      and tenant_id = p_tenant_id
      and status in ('waiting', 'called', 'in_service')
    for update;

    if found then
      v_previous_queue := v_queue;
      update public.appointment_queue
      set status = 'done',
          completed_at = coalesce(completed_at, v_now)
      where id = v_queue.id
        and tenant_id = p_tenant_id
      returning * into v_queue;
    end if;

  else
    if p_queue_id is null then
      raise exception 'Queue id is required';
    end if;

    select *
    into v_queue
    from public.appointment_queue
    where id = p_queue_id
      and tenant_id = p_tenant_id
    for update;

    if not found then
      raise exception 'Queue entry not found' using errcode = 'P0002';
    end if;

    v_previous_queue := v_queue;

    if p_expected_updated_at is not null and v_queue.updated_at <> p_expected_updated_at then
      result_code := 'CONFLICT';
      retryable := true;
      idempotency_replay := false;
      message := 'Queue entry was modified by another user';
      appointment := null;
      queue_entry := null;
      return next;
      return;
    end if;

    select *
    into v_appointment
    from public.appointments
    where id = v_queue.appointment_id
      and tenant_id = p_tenant_id
      and deleted_at is null
    for update;

    if not found then
      raise exception 'Appointment not found' using errcode = 'P0002';
    end if;

    v_previous_appointment := v_appointment;

    if v_operation = 'call' then
      if v_queue.status <> 'waiting' then
        raise exception 'Cannot call queue entry from current status';
      end if;
      update public.appointment_queue
      set status = 'called',
          called_at = v_now
      where id = v_queue.id
        and tenant_id = p_tenant_id
      returning * into v_queue;
    elsif v_operation = 'wait' then
      if v_queue.status <> 'called' then
        raise exception 'Cannot return queue entry to waiting from current status';
      end if;
      update public.appointment_queue
      set status = 'waiting',
          called_at = null
      where id = v_queue.id
        and tenant_id = p_tenant_id
      returning * into v_queue;
    elsif v_operation = 'start' then
      if v_queue.status <> 'called' then
        raise exception 'Cannot start queue entry from current status';
      end if;
      update public.appointment_queue
      set status = 'in_service'
      where id = v_queue.id
        and tenant_id = p_tenant_id
      returning * into v_queue;
      update public.appointments
      set status = 'in_progress'
      where id = v_appointment.id
        and tenant_id = p_tenant_id
      returning * into v_appointment;
    elsif v_operation = 'complete' then
      if v_queue.status <> 'in_service' then
        raise exception 'Cannot complete queue entry from current status';
      end if;
      update public.appointment_queue
      set status = 'done',
          completed_at = v_now
      where id = v_queue.id
        and tenant_id = p_tenant_id
      returning * into v_queue;
      update public.appointments
      set status = 'completed'
      where id = v_appointment.id
        and tenant_id = p_tenant_id
      returning * into v_appointment;
    elsif v_operation = 'no_show' then
      if v_queue.status not in ('waiting', 'called') then
        raise exception 'Cannot mark queue entry no-show from current status';
      end if;
      update public.appointment_queue
      set status = 'no_show',
          completed_at = v_now
      where id = v_queue.id
        and tenant_id = p_tenant_id
      returning * into v_queue;
      update public.appointments
      set status = 'no_show'
      where id = v_appointment.id
        and tenant_id = p_tenant_id
      returning * into v_appointment;
    end if;
  end if;

  v_event_id := public.create_domain_event(
    'AppointmentLifecycleTransitioned',
    1,
    'appointment',
    v_appointment.id,
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'appointmentId', v_appointment.id,
      'queueId', v_queue.id,
      'patientId', v_appointment.patient_id,
      'doctorId', v_appointment.doctor_id,
      'operation', v_operation,
      'previousAppointmentStatus', v_previous_appointment.status,
      'appointmentStatus', v_appointment.status,
      'previousQueueStatus', v_previous_queue.status,
      'queueStatus', v_queue.status
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
    'appointment_lifecycle_' || v_operation,
    'appointment_lifecycle',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'appointment', 'appointment', v_appointment.id, v_appointment.id,
    jsonb_build_object(
      'appointment_id', v_appointment.id,
      'queue_id', v_queue.id,
      'operation', v_operation,
      'actor_id', v_actor_id,
      'previous_appointment_status', v_previous_appointment.status,
      'appointment_status', v_appointment.status,
      'previous_queue_status', v_previous_queue.status,
      'queue_status', v_queue.status,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_appointment_lifecycle'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Appointment lifecycle command committed';
  appointment := to_jsonb(v_appointment);
  queue_entry := case when v_queue.id is null then null else to_jsonb(v_queue) end;

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
        response_payload = jsonb_build_object('appointment', appointment, 'queue_entry', queue_entry, 'domain_event_id', v_event_id),
        request_trace_id = coalesce(request_trace_id, p_request_trace_id),
        operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
        workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
        updated_at = now()
    where id = v_idempotency.id;
  end if;

  return next;
end;
$function$;

revoke all on function public.command_appointment_lifecycle(text, uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text) from anon;
grant execute on function public.command_appointment_lifecycle(text, uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text) to authenticated;
