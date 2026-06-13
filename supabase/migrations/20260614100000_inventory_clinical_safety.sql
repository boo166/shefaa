-- Wave G: inventory clinical safety — reservation, dispense, release authority

alter table public.medications
  add column if not exists reserved_quantity integer not null default 0;

alter table public.medications
  drop constraint if exists medications_reserved_quantity_check;

alter table public.medications
  add constraint medications_reserved_quantity_check
  check (reserved_quantity >= 0 and reserved_quantity <= stock);

create table if not exists public.medication_reservations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  patient_id uuid null references public.patients(id) on delete set null,
  prescription_id uuid null references public.prescriptions(id) on delete set null,
  quantity integer not null check (quantity > 0),
  status text not null default 'active' check (status in ('active', 'released', 'dispensed')),
  reserved_at timestamptz not null default now(),
  released_at timestamptz null,
  dispensed_at timestamptz null,
  batch_id uuid null references public.medication_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_medication_reservations_tenant_status
  on public.medication_reservations (tenant_id, medication_id, status);

drop trigger if exists update_medication_reservations_updated_at on public.medication_reservations;
create trigger update_medication_reservations_updated_at
before update on public.medication_reservations
for each row execute function public.update_updated_at_column();

alter table public.medication_reservations enable row level security;

drop policy if exists "Tenant users can view medication reservations" on public.medication_reservations;
create policy "Tenant users can view medication reservations"
on public.medication_reservations
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

drop function if exists public.command_medication_reserve(
  uuid, uuid, integer, uuid, uuid, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_medication_reserve(
  p_medication_id uuid,
  p_tenant_id uuid,
  p_quantity integer,
  p_patient_id uuid default null,
  p_prescription_id uuid default null,
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
  reservation jsonb,
  medication jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_medication public.medications%rowtype;
  v_reservation public.medication_reservations%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
  v_available integer;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for medication reserve command' using errcode = '42501';
  end if;

  if p_medication_id is null or p_quantity is null or p_quantity <= 0 then
    raise exception 'Medication id and positive quantity are required';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'medication_reserve', p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'medication_reserve'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Medication reserve replayed';
      reservation := v_idempotency.response_payload->'reservation';
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
    reservation := null;
    medication := null;
    return next;
    return;
  end if;

  v_available := v_medication.stock - v_medication.reserved_quantity;
  if v_available < p_quantity then
    raise exception 'Insufficient available stock for reservation';
  end if;

  if p_patient_id is not null and not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.tenant_id = p_tenant_id and p.deleted_at is null
  ) then
    raise exception 'Reservation patient does not belong to tenant' using errcode = '42501';
  end if;

  if p_prescription_id is not null and not exists (
    select 1 from public.prescriptions pr
    where pr.id = p_prescription_id and pr.tenant_id = p_tenant_id
  ) then
    raise exception 'Reservation prescription does not belong to tenant' using errcode = '42501';
  end if;

  insert into public.medication_reservations (
    tenant_id, medication_id, patient_id, prescription_id, quantity, status
  )
  values (
    p_tenant_id, p_medication_id, p_patient_id, p_prescription_id, p_quantity, 'active'
  )
  returning * into v_reservation;

  update public.medications
  set reserved_quantity = reserved_quantity + p_quantity
  where id = v_medication.id
    and tenant_id = p_tenant_id
  returning * into v_medication;

  v_event_id := public.create_domain_event(
    'MedicationReserved', 1, 'medication_reservation', v_reservation.id, p_tenant_id, v_actor_id,
    jsonb_build_object(
      'reservationId', v_reservation.id,
      'medicationId', v_medication.id,
      'patientId', v_reservation.patient_id,
      'quantity', v_reservation.quantity
    ),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    'medication_reserved', 'medication_reserve',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'medication_reservation', 'medication_reservation', v_reservation.id, v_reservation.id,
    jsonb_build_object(
      'reservation_id', v_reservation.id,
      'medication_id', v_medication.id,
      'quantity', v_reservation.quantity,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_medication_reserve'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Medication reserved';
  reservation := to_jsonb(v_reservation);
  medication := to_jsonb(v_medication);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('reservation', reservation, 'medication', medication, 'domain_event_id', v_event_id),
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
      'command', 'command_medication_reserve',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'reservation_id', v_reservation.id,
      'medication_id', v_medication.id,
      'domain_event_id', v_event_id
    )
  );

  return next;
end;
$function$;

drop function if exists public.command_medication_release(
  uuid, uuid, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_medication_release(
  p_reservation_id uuid,
  p_tenant_id uuid,
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
  reservation jsonb,
  medication jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_reservation public.medication_reservations%rowtype;
  v_medication public.medications%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for medication release command' using errcode = '42501';
  end if;

  if p_reservation_id is null then
    raise exception 'Reservation id is required';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'medication_release', p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'medication_release'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Medication release replayed';
      reservation := v_idempotency.response_payload->'reservation';
      medication := v_idempotency.response_payload->'medication';
      return next;
      return;
    end if;
  end if;

  select *
  into v_reservation
  from public.medication_reservations
  where id = p_reservation_id
    and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'Medication reservation not found' using errcode = 'P0002';
  end if;

  if v_reservation.status <> 'active' then
    raise exception 'Only active reservations can be released';
  end if;

  select *
  into v_medication
  from public.medications
  where id = v_reservation.medication_id
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
    reservation := null;
    medication := null;
    return next;
    return;
  end if;

  update public.medication_reservations
  set status = 'released',
      released_at = now()
  where id = v_reservation.id
    and tenant_id = p_tenant_id
  returning * into v_reservation;

  update public.medications
  set reserved_quantity = greatest(reserved_quantity - v_reservation.quantity, 0)
  where id = v_medication.id
    and tenant_id = p_tenant_id
  returning * into v_medication;

  v_event_id := public.create_domain_event(
    'MedicationReservationReleased', 1, 'medication_reservation', v_reservation.id, p_tenant_id, v_actor_id,
    jsonb_build_object(
      'reservationId', v_reservation.id,
      'medicationId', v_medication.id,
      'quantity', v_reservation.quantity
    ),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    'medication_reservation_released', 'medication_release',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'medication_reservation', 'medication_reservation', v_reservation.id, v_reservation.id,
    jsonb_build_object(
      'reservation_id', v_reservation.id,
      'medication_id', v_medication.id,
      'quantity', v_reservation.quantity,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_medication_release'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Medication reservation released';
  reservation := to_jsonb(v_reservation);
  medication := to_jsonb(v_medication);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('reservation', reservation, 'medication', medication, 'domain_event_id', v_event_id),
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
      'command', 'command_medication_release',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'reservation_id', v_reservation.id,
      'domain_event_id', v_event_id
    )
  );

  return next;
end;
$function$;

drop function if exists public.command_medication_dispense(
  uuid, uuid, uuid, uuid, integer, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_medication_dispense(
  p_medication_id uuid,
  p_batch_id uuid,
  p_tenant_id uuid,
  p_reservation_id uuid default null,
  p_quantity integer default null,
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
  reservation jsonb,
  inventory_movement jsonb,
  medication jsonb,
  medication_batch jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_medication public.medications%rowtype;
  v_batch public.medication_batches%rowtype;
  v_reservation public.medication_reservations%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
  v_quantity integer;
  v_status text;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for medication dispense command' using errcode = '42501';
  end if;

  if p_medication_id is null or p_batch_id is null then
    raise exception 'Medication id and batch id are required';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'medication_dispense', p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'medication_dispense'
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Medication dispense replayed';
      reservation := v_idempotency.response_payload->'reservation';
      inventory_movement := v_idempotency.response_payload->'inventory_movement';
      medication := v_idempotency.response_payload->'medication';
      medication_batch := v_idempotency.response_payload->'medication_batch';
      return next;
      return;
    end if;
  end if;

  if p_reservation_id is not null then
    select *
    into v_reservation
    from public.medication_reservations
    where id = p_reservation_id
      and tenant_id = p_tenant_id
      and medication_id = p_medication_id
    for update;

    if not found then
      raise exception 'Medication reservation not found' using errcode = 'P0002';
    end if;

    if v_reservation.status <> 'active' then
      raise exception 'Only active reservations can be dispensed';
    end if;

    v_quantity := coalesce(p_quantity, v_reservation.quantity);
    if v_quantity <> v_reservation.quantity then
      raise exception 'Dispense quantity must match reservation quantity';
    end if;
  else
    v_quantity := p_quantity;
    if v_quantity is null or v_quantity <= 0 then
      raise exception 'Dispense quantity is required when no reservation is provided';
    end if;
  end if;

  select *
  into v_batch
  from public.medication_batches
  where id = p_batch_id
    and tenant_id = p_tenant_id
    and medication_id = p_medication_id
  for update;

  if not found then
    raise exception 'Medication batch not found' using errcode = 'P0002';
  end if;

  if v_batch.expiry_date is not null and v_batch.expiry_date < current_date then
    raise exception 'Cannot dispense from expired medication batch';
  end if;

  if v_batch.quantity < v_quantity then
    raise exception 'Batch quantity is insufficient for dispense';
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
    reservation := null;
    inventory_movement := null;
    medication := null;
    medication_batch := null;
    return next;
    return;
  end if;

  if v_medication.stock < v_quantity then
    raise exception 'Medication stock is insufficient for dispense';
  end if;

  if p_reservation_id is not null and v_medication.reserved_quantity < v_quantity then
    raise exception 'Reserved quantity is insufficient for dispense';
  end if;

  update public.medication_batches
  set quantity = quantity - v_quantity
  where id = v_batch.id
    and tenant_id = p_tenant_id
  returning * into v_batch;

  insert into public.inventory_movements (
    tenant_id, medication_id, batch_id, movement_type, quantity, source_reference
  )
  values (
    p_tenant_id,
    p_medication_id,
    v_batch.id,
    'dispense',
    -v_quantity,
    case
      when p_reservation_id is not null then 'reservation:' || p_reservation_id::text || ':dispense'
      else 'dispense:' || p_medication_id::text || ':batch:' || v_batch.id::text
    end
  )
  returning * into v_movement;

  v_status := case
    when v_medication.stock - v_quantity <= 0 then 'out_of_stock'
    when v_medication.stock - v_quantity < 50 then 'low_stock'
    else 'in_stock'
  end;

  update public.medications
  set
    stock = stock - v_quantity,
    reserved_quantity = case
      when p_reservation_id is not null then greatest(reserved_quantity - v_quantity, 0)
      else reserved_quantity
    end,
    status = v_status
  where id = v_medication.id
    and tenant_id = p_tenant_id
  returning * into v_medication;

  if p_reservation_id is not null then
    update public.medication_reservations
    set status = 'dispensed',
        dispensed_at = now(),
        batch_id = v_batch.id
    where id = v_reservation.id
      and tenant_id = p_tenant_id
    returning * into v_reservation;
  end if;

  v_event_id := public.create_domain_event(
    'MedicationDispensed', 1, 'inventory_movement', v_movement.id, p_tenant_id, v_actor_id,
    jsonb_build_object(
      'movementId', v_movement.id,
      'medicationId', v_medication.id,
      'batchId', v_batch.id,
      'reservationId', p_reservation_id,
      'quantity', v_quantity
    ),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    'medication_dispensed', 'medication_dispense',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'inventory_movement', 'inventory_movement', v_movement.id, v_movement.id,
    jsonb_build_object(
      'movement_id', v_movement.id,
      'medication_id', v_medication.id,
      'batch_id', v_batch.id,
      'reservation_id', p_reservation_id,
      'quantity', v_quantity,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_medication_dispense'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Medication dispensed';
  reservation := case when p_reservation_id is not null then to_jsonb(v_reservation) else null end;
  inventory_movement := to_jsonb(v_movement);
  medication := to_jsonb(v_medication);
  medication_batch := to_jsonb(v_batch);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object(
        'reservation', reservation,
        'inventory_movement', inventory_movement,
        'medication', medication,
        'medication_batch', medication_batch,
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
      'command', 'command_medication_dispense',
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'movement_id', v_movement.id,
      'domain_event_id', v_event_id
    )
  );

  return next;
end;
$function$;

revoke all on function public.command_medication_reserve(uuid, uuid, integer, uuid, uuid, timestamptz, text, text, uuid, text, text, text) from anon;
revoke all on function public.command_medication_release(uuid, uuid, timestamptz, text, text, uuid, text, text, text) from anon;
revoke all on function public.command_medication_dispense(uuid, uuid, uuid, uuid, integer, timestamptz, text, text, uuid, text, text, text) from anon;

grant execute on function public.command_medication_reserve(uuid, uuid, integer, uuid, uuid, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.command_medication_release(uuid, uuid, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.command_medication_dispense(uuid, uuid, uuid, uuid, integer, timestamptz, text, text, uuid, text, text, text) to authenticated;
