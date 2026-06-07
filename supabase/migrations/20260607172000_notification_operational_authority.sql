alter table public.notifications
  add column if not exists delivery_key text not null default ('manual:'::text || gen_random_uuid()::text),
  add column if not exists source_event_id uuid null references public.domain_events(id) on delete set null,
  add column if not exists source_outbox_id uuid null references public.event_outbox(id) on delete set null,
  add column if not exists delivered_at timestamptz null,
  add column if not exists acknowledged_at timestamptz null,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists ux_notifications_tenant_delivery_key
on public.notifications (tenant_id, delivery_key);

create index if not exists idx_notifications_source_event
on public.notifications (source_event_id)
where source_event_id is not null;

create index if not exists idx_notifications_source_outbox
on public.notifications (source_outbox_id)
where source_outbox_id is not null;

drop trigger if exists update_notifications_updated_at on public.notifications;
create trigger update_notifications_updated_at
  before update on public.notifications
  for each row execute function public.update_updated_at_column();

drop function if exists public.command_notification_delivery(
  uuid, uuid, text, text, text, text, uuid, uuid, boolean, text, text, uuid, text, text, text
);

create or replace function public.command_notification_delivery(
  p_tenant_id uuid,
  p_user_id uuid,
  p_title text,
  p_body text default null,
  p_type text default 'system_event',
  p_delivery_key text default null,
  p_source_event_id uuid default null,
  p_source_outbox_id uuid default null,
  p_read boolean default false,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_actor_user_id uuid default null,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  result_code text,
  retryable boolean,
  idempotency_replay boolean,
  message text,
  notification jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_delivery_key text := nullif(trim(coalesce(p_delivery_key, '')), '');
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_type text := coalesce(nullif(trim(coalesce(p_type, '')), ''), 'system_event');
  v_idempotency_key text;
  v_idempotency public.command_idempotency%rowtype;
  v_notification public.notifications%rowtype;
  v_existing public.notifications%rowtype;
  v_actor_id uuid := coalesce(p_actor_user_id, auth.uid(), p_user_id);
  v_is_worker boolean := public.is_event_delivery_worker();
  v_now timestamptz := now();
begin
  if p_tenant_id is null then
    raise exception 'Notification tenant is required';
  end if;

  if not v_is_worker and p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for notification delivery command' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'Notification recipient is required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = p_user_id
      and p.tenant_id = p_tenant_id
  ) then
    raise exception 'Notification recipient does not belong to tenant' using errcode = '42501';
  end if;

  if v_title is null then
    raise exception 'Notification title is required';
  end if;

  if v_delivery_key is null then
    raise exception 'Notification delivery key is required';
  end if;

  if p_source_event_id is not null and not exists (
    select 1 from public.domain_events e
    where e.id = p_source_event_id
      and e.tenant_id = p_tenant_id
  ) then
    raise exception 'Notification source event does not belong to tenant' using errcode = '42501';
  end if;

  if p_source_outbox_id is not null and not exists (
    select 1 from public.event_outbox o
    where o.id = p_source_outbox_id
      and o.tenant_id = p_tenant_id
      and o.handler_name = 'notifications'
  ) then
    raise exception 'Notification source outbox does not belong to tenant' using errcode = '42501';
  end if;

  v_idempotency_key := coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), v_delivery_key);

  insert into public.command_idempotency (
    tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
    request_trace_id, operation_trace_id, workflow_trace_id
  )
  values (
    p_tenant_id, 'notification_delivery', v_idempotency_key, coalesce(p_request_hash, ''),
    'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
  )
  on conflict (tenant_id, operation_type, idempotency_key) do nothing;

  select *
  into v_idempotency
  from public.command_idempotency
  where tenant_id = p_tenant_id
    and operation_type = 'notification_delivery'
    and idempotency_key = v_idempotency_key
  for update;

  if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
    raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
  end if;

  if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
    result_code := 'OK';
    retryable := false;
    idempotency_replay := true;
    message := 'Notification delivery command replayed';
    notification := v_idempotency.response_payload->'notification';
    return next;
    return;
  end if;

  select *
  into v_existing
  from public.notifications
  where tenant_id = p_tenant_id
    and delivery_key = v_delivery_key
  for update;

  if found then
    v_notification := v_existing;
    result_code := 'OK';
    retryable := false;
    idempotency_replay := true;
    message := 'Notification delivery already materialized';
    notification := to_jsonb(v_notification);
  else
    insert into public.notifications (
      tenant_id, user_id, title, body, type, read, delivery_key,
      source_event_id, source_outbox_id, delivered_at, acknowledged_at
    )
    values (
      p_tenant_id, p_user_id, v_title, p_body, v_type, coalesce(p_read, false), v_delivery_key,
      p_source_event_id, p_source_outbox_id, v_now, case when coalesce(p_read, false) then v_now else null end
    )
    returning * into v_notification;

    insert into public.audit_logs (
      tenant_id, user_id, actor_id, action, action_type, request_id,
      entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
    )
    values (
      p_tenant_id, p_user_id, v_actor_id,
      'notification_delivered',
      'notification_delivery',
      case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
      'notification', 'notification', v_notification.id, v_notification.id,
      jsonb_build_object(
        'notificationId', v_notification.id,
        'userId', p_user_id,
        'deliveryKey', v_delivery_key,
        'sourceEventId', p_source_event_id,
        'sourceOutboxId', p_source_outbox_id,
        'actorId', v_actor_id,
        'requestTraceId', p_request_trace_id,
        'operationTraceId', p_operation_trace_id,
        'workflowTraceId', p_workflow_trace_id
      ),
      jsonb_build_object(
        'transactional_command', 'command_notification_delivery',
        'source_event_id', p_source_event_id,
        'source_outbox_id', p_source_outbox_id
      ),
      false
    );

    result_code := 'OK';
    retryable := false;
    idempotency_replay := false;
    message := 'Notification delivery command committed';
    notification := to_jsonb(v_notification);
  end if;

  update public.command_idempotency
  set status = 'committed',
      response_payload = jsonb_build_object('notification', notification),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
  where id = v_idempotency.id;

  return next;
end;
$function$;

drop function if exists public.command_notification_acknowledge(
  uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_notification_acknowledge(
  p_notification_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_expected_updated_at timestamptz default null,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_actor_user_id uuid default null,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  result_code text,
  retryable boolean,
  idempotency_replay boolean,
  message text,
  notification jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_idempotency public.command_idempotency%rowtype;
  v_notification public.notifications%rowtype;
  v_actor_id uuid := coalesce(p_actor_user_id, auth.uid(), p_user_id);
  v_is_worker boolean := public.is_event_delivery_worker();
  v_key text := coalesce(nullif(trim(coalesce(p_idempotency_key, '')), ''), 'notification_ack:' || p_notification_id::text || ':' || p_user_id::text);
begin
  if p_tenant_id is null or p_notification_id is null or p_user_id is null then
    raise exception 'Notification acknowledgement command requires tenant, notification, and user';
  end if;

  if not v_is_worker and p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for notification acknowledgement command' using errcode = '42501';
  end if;

  if not v_is_worker and p_user_id <> auth.uid() then
    raise exception 'Notification acknowledgement user mismatch' using errcode = '42501';
  end if;

  insert into public.command_idempotency (
    tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
    request_trace_id, operation_trace_id, workflow_trace_id
  )
  values (
    p_tenant_id, 'notification_acknowledge', v_key, coalesce(p_request_hash, ''),
    'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
  )
  on conflict (tenant_id, operation_type, idempotency_key) do nothing;

  select *
  into v_idempotency
  from public.command_idempotency
  where tenant_id = p_tenant_id
    and operation_type = 'notification_acknowledge'
    and idempotency_key = v_key
  for update;

  if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
    raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
  end if;

  if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
    result_code := 'OK';
    retryable := false;
    idempotency_replay := true;
    message := 'Notification acknowledgement command replayed';
    notification := v_idempotency.response_payload->'notification';
    return next;
    return;
  end if;

  select *
  into v_notification
  from public.notifications
  where id = p_notification_id
    and tenant_id = p_tenant_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Notification not found' using errcode = 'P0002';
  end if;

  if p_expected_updated_at is not null and v_notification.updated_at <> p_expected_updated_at then
    result_code := 'CONFLICT';
    retryable := true;
    idempotency_replay := false;
    message := 'Notification was modified by another user';
    notification := null;
    return next;
    return;
  end if;

  if not v_notification.read then
    update public.notifications
    set read = true,
        acknowledged_at = coalesce(acknowledged_at, now())
    where id = v_notification.id
      and tenant_id = p_tenant_id
      and user_id = p_user_id
    returning * into v_notification;

    insert into public.audit_logs (
      tenant_id, user_id, actor_id, action, action_type, request_id,
      entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
    )
    values (
      p_tenant_id, p_user_id, v_actor_id,
      'notification_acknowledged',
      'notification_acknowledgement',
      case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
      'notification', 'notification', v_notification.id, v_notification.id,
      jsonb_build_object(
        'notificationId', v_notification.id,
        'userId', p_user_id,
        'deliveryKey', v_notification.delivery_key,
        'sourceEventId', v_notification.source_event_id,
        'sourceOutboxId', v_notification.source_outbox_id,
        'actorId', v_actor_id,
        'requestTraceId', p_request_trace_id,
        'operationTraceId', p_operation_trace_id,
        'workflowTraceId', p_workflow_trace_id
      ),
      jsonb_build_object(
        'transactional_command', 'command_notification_acknowledge',
        'source_event_id', v_notification.source_event_id,
        'source_outbox_id', v_notification.source_outbox_id
      ),
      false
    );
  end if;

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Notification acknowledgement command committed';
  notification := to_jsonb(v_notification);

  update public.command_idempotency
  set status = 'committed',
      response_payload = jsonb_build_object('notification', notification),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
  where id = v_idempotency.id;

  return next;
end;
$function$;

create or replace function public.notification_delivery_drift(p_tenant_id uuid)
returns table (
  pending_notification_outbox bigint,
  delivered_without_notification bigint,
  orphan_source_notifications bigint,
  duplicate_delivery_keys bigint
)
language sql
security definer
set search_path = public
as $function$
  select
    (
      select count(*)
      from public.event_outbox o
      where o.tenant_id = p_tenant_id
        and o.handler_name = 'notifications'
        and o.status in ('PENDING', 'PROCESSING', 'RETRY')
    )::bigint,
    (
      select count(*)
      from public.event_outbox o
      where o.tenant_id = p_tenant_id
        and o.handler_name = 'notifications'
        and o.status = 'DELIVERED'
        and not exists (
          select 1 from public.notifications n
          where n.tenant_id = o.tenant_id
            and n.source_outbox_id = o.id
        )
    )::bigint,
    (
      select count(*)
      from public.notifications n
      where n.tenant_id = p_tenant_id
        and n.source_outbox_id is not null
        and not exists (
          select 1 from public.event_outbox o
          where o.id = n.source_outbox_id
            and o.tenant_id = n.tenant_id
        )
    )::bigint,
    (
      select coalesce(sum(dupe_count - 1), 0)
      from (
        select count(*) as dupe_count
        from public.notifications n
        where n.tenant_id = p_tenant_id
        group by n.delivery_key
        having count(*) > 1
      ) d
    )::bigint;
$function$;

revoke all on function public.command_notification_delivery(uuid, uuid, text, text, text, text, uuid, uuid, boolean, text, text, uuid, text, text, text) from anon;
revoke all on function public.command_notification_acknowledge(uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text) from anon;
revoke all on function public.notification_delivery_drift(uuid) from anon;

grant execute on function public.command_notification_delivery(uuid, uuid, text, text, text, text, uuid, uuid, boolean, text, text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.command_notification_acknowledge(uuid, uuid, uuid, timestamptz, text, text, uuid, text, text, text) to authenticated, service_role;
grant execute on function public.notification_delivery_drift(uuid) to authenticated, service_role;
