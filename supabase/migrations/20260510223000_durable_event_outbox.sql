create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.domain_events
  add column if not exists user_id uuid null references auth.users(id) on delete set null,
  add column if not exists request_trace_id text null,
  add column if not exists operation_trace_id text null,
  add column if not exists workflow_trace_id text null,
  add column if not exists runtime_transition_trace_id text null;

create table if not exists public.event_outbox (
  id uuid primary key default gen_random_uuid(),
  domain_event_id uuid null references public.domain_events(id) on delete set null,
  event_type text not null,
  event_version integer not null default 1,
  aggregate_type text not null,
  aggregate_id uuid null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  handler_name text not null,
  delivery_guarantee text not null default 'at_least_once'
    check (delivery_guarantee in ('at_least_once', 'exactly_once_persistence', 'best_effort', 'eventually_consistent')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'RETRY', 'FAILED', 'DELIVERED', 'DEAD_LETTER')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at timestamptz not null default now(),
  locked_at timestamptz null,
  locked_by text null,
  processed_at timestamptz null,
  last_error text null,
  last_error_code text null,
  request_trace_id text null,
  operation_trace_id text null,
  workflow_trace_id text null,
  runtime_transition_trace_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain_event_id, handler_name)
);

alter table public.event_outbox enable row level security;

create index if not exists idx_event_outbox_claim
on public.event_outbox (status, next_retry_at, created_at)
where status in ('PENDING', 'RETRY');

create index if not exists idx_event_outbox_tenant_status
on public.event_outbox (tenant_id, status, created_at desc);

create index if not exists idx_event_outbox_handler_status
on public.event_outbox (handler_name, status, created_at desc);

create index if not exists idx_event_outbox_domain_event
on public.event_outbox (domain_event_id);

drop trigger if exists update_event_outbox_updated_at on public.event_outbox;
create trigger update_event_outbox_updated_at
before update on public.event_outbox
for each row execute function public.update_updated_at_column();

drop policy if exists "Tenant admins can view event outbox" on public.event_outbox;
create policy "Tenant admins can view event outbox"
on public.event_outbox
for select to authenticated
using (
  (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and public.has_role(auth.uid(), 'clinic_admin'::app_role)
  )
  or public.has_role(auth.uid(), 'super_admin'::app_role)
);

drop policy if exists "No direct event outbox mutation" on public.event_outbox;
create policy "No direct event outbox mutation"
on public.event_outbox
for all to authenticated
using (false)
with check (false);

create table if not exists public.event_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.event_outbox(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  handler_name text not null,
  attempt_number integer not null,
  status text not null check (status in ('PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER')),
  worker_id text null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  latency_ms integer null,
  error_code text null,
  error_message text null,
  request_trace_id text null,
  operation_trace_id text null,
  workflow_trace_id text null,
  created_at timestamptz not null default now()
);

alter table public.event_delivery_attempts enable row level security;

create index if not exists idx_event_delivery_attempts_outbox
on public.event_delivery_attempts (outbox_id, attempt_number desc);

create index if not exists idx_event_delivery_attempts_tenant_created
on public.event_delivery_attempts (tenant_id, created_at desc);

drop policy if exists "Tenant admins can view event delivery attempts" on public.event_delivery_attempts;
create policy "Tenant admins can view event delivery attempts"
on public.event_delivery_attempts
for select to authenticated
using (
  (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and public.has_role(auth.uid(), 'clinic_admin'::app_role)
  )
  or public.has_role(auth.uid(), 'super_admin'::app_role)
);

drop policy if exists "No direct event delivery attempt mutation" on public.event_delivery_attempts;
create policy "No direct event delivery attempt mutation"
on public.event_delivery_attempts
for all to authenticated
using (false)
with check (false);

create table if not exists public.dead_letter_events (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique references public.event_outbox(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  handler_name text not null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null,
  last_error text null,
  last_error_code text null,
  request_trace_id text null,
  operation_trace_id text null,
  workflow_trace_id text null,
  dead_lettered_at timestamptz not null default now(),
  replayed_at timestamptz null,
  replayed_by uuid null references auth.users(id) on delete set null
);

alter table public.dead_letter_events enable row level security;

create index if not exists idx_dead_letter_events_tenant_created
on public.dead_letter_events (tenant_id, dead_lettered_at desc);

drop policy if exists "Tenant admins can view dead letter events" on public.dead_letter_events;
create policy "Tenant admins can view dead letter events"
on public.dead_letter_events
for select to authenticated
using (
  (
    tenant_id = public.get_user_tenant_id(auth.uid())
    and public.has_role(auth.uid(), 'clinic_admin'::app_role)
  )
  or public.has_role(auth.uid(), 'super_admin'::app_role)
);

drop policy if exists "No direct dead letter mutation" on public.dead_letter_events;
create policy "No direct dead letter mutation"
on public.dead_letter_events
for all to authenticated
using (false)
with check (false);

create unique index if not exists idx_audit_logs_event_outbox_once
on public.audit_logs ((details->>'event_outbox_id'))
where details ? 'event_outbox_id';

create or replace function public.enqueue_event_outbox_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.event_outbox (
    domain_event_id,
    event_type,
    event_version,
    aggregate_type,
    aggregate_id,
    tenant_id,
    user_id,
    handler_name,
    delivery_guarantee,
    payload,
    max_attempts,
    request_trace_id,
    operation_trace_id,
    workflow_trace_id,
    runtime_transition_trace_id
  )
  values
    (
      new.id,
      new.event_type,
      new.event_version,
      new.entity_type,
      new.entity_id,
      new.tenant_id,
      new.user_id,
      'audit',
      'exactly_once_persistence',
      new.payload,
      7,
      new.request_trace_id,
      new.operation_trace_id,
      new.workflow_trace_id,
      new.runtime_transition_trace_id
    ),
    (
      new.id,
      new.event_type,
      new.event_version,
      new.entity_type,
      new.entity_id,
      new.tenant_id,
      new.user_id,
      'analytics',
      'best_effort',
      new.payload,
      1,
      new.request_trace_id,
      new.operation_trace_id,
      new.workflow_trace_id,
      new.runtime_transition_trace_id
    )
  on conflict (domain_event_id, handler_name) do nothing;

  if new.user_id is not null then
    insert into public.event_outbox (
      domain_event_id,
      event_type,
      event_version,
      aggregate_type,
      aggregate_id,
      tenant_id,
      user_id,
      handler_name,
      delivery_guarantee,
      payload,
      max_attempts,
      request_trace_id,
      operation_trace_id,
      workflow_trace_id,
      runtime_transition_trace_id
    )
    values (
      new.id,
      new.event_type,
      new.event_version,
      new.entity_type,
      new.entity_id,
      new.tenant_id,
      new.user_id,
      'notifications',
      'at_least_once',
      new.payload,
      5,
      new.request_trace_id,
      new.operation_trace_id,
      new.workflow_trace_id,
      new.runtime_transition_trace_id
    )
    on conflict (domain_event_id, handler_name) do nothing;
  end if;

  return new;
end;
$function$;

drop trigger if exists enqueue_event_outbox_rows on public.domain_events;
create trigger enqueue_event_outbox_rows
after insert on public.domain_events
for each row execute function public.enqueue_event_outbox_rows();

create or replace function public.is_event_delivery_worker()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(auth.role(), current_setting('request.jwt.claim.role', true), current_user) in ('service_role', 'postgres', 'supabase_admin');
$function$;

create or replace function public.event_outbox_claim_batch(
  _limit integer default 25,
  _worker_id text default 'event-delivery-worker'
)
returns setof public.event_outbox
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_limit integer := least(greatest(coalesce(_limit, 25), 1), 100);
begin
  if not public.is_event_delivery_worker() then
    raise exception 'Only the event delivery worker can claim events' using errcode = '42501';
  end if;

  update public.event_outbox
  set
    status = 'RETRY',
    locked_at = null,
    locked_by = null,
    next_retry_at = now(),
    last_error = coalesce(last_error, 'Processing lock expired')
  where status = 'PROCESSING'
    and locked_at < now() - interval '15 minutes';

  return query
  with claimable as (
    select id
    from public.event_outbox
    where status in ('PENDING', 'RETRY')
      and next_retry_at <= now()
    order by created_at asc
    limit v_limit
    for update skip locked
  ),
  claimed as (
    update public.event_outbox o
    set
      status = 'PROCESSING',
      locked_at = now(),
      locked_by = coalesce(nullif(_worker_id, ''), 'event-delivery-worker'),
      attempts = o.attempts + 1,
      last_error = null,
      last_error_code = null
    from claimable c
    where o.id = c.id
    returning o.*
  )
  select * from claimed;
end;
$function$;

create or replace function public.event_outbox_record_attempt(
  _outbox_id uuid,
  _status text,
  _worker_id text default null,
  _latency_ms integer default null,
  _error_code text default null,
  _error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_event public.event_outbox%rowtype;
begin
  if not public.is_event_delivery_worker() then
    raise exception 'Only the event delivery worker can record attempts' using errcode = '42501';
  end if;

  select * into v_event
  from public.event_outbox
  where id = _outbox_id;

  if not found then
    raise exception 'Outbox event not found';
  end if;

  insert into public.event_delivery_attempts (
    outbox_id,
    tenant_id,
    handler_name,
    attempt_number,
    status,
    worker_id,
    completed_at,
    latency_ms,
    error_code,
    error_message,
    request_trace_id,
    operation_trace_id,
    workflow_trace_id
  )
  values (
    v_event.id,
    v_event.tenant_id,
    v_event.handler_name,
    v_event.attempts,
    _status,
    _worker_id,
    now(),
    _latency_ms,
    _error_code,
    _error_message,
    v_event.request_trace_id,
    v_event.operation_trace_id,
    v_event.workflow_trace_id
  );
end;
$function$;

create or replace function public.event_outbox_mark_delivered(
  _outbox_id uuid,
  _worker_id text default null,
  _latency_ms integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not public.is_event_delivery_worker() then
    raise exception 'Only the event delivery worker can complete events' using errcode = '42501';
  end if;

  update public.event_outbox
  set
    status = 'DELIVERED',
    processed_at = now(),
    locked_at = null,
    locked_by = null,
    last_error = null,
    last_error_code = null
  where id = _outbox_id;

  perform public.event_outbox_record_attempt(_outbox_id, 'DELIVERED', _worker_id, _latency_ms, null, null);
end;
$function$;

create or replace function public.event_outbox_mark_failed(
  _outbox_id uuid,
  _worker_id text default null,
  _error_code text default null,
  _error_message text default null,
  _latency_ms integer default null
)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_event public.event_outbox%rowtype;
  v_next_status text;
  v_delay_seconds integer;
begin
  if not public.is_event_delivery_worker() then
    raise exception 'Only the event delivery worker can fail events' using errcode = '42501';
  end if;

  select * into v_event
  from public.event_outbox
  where id = _outbox_id
  for update;

  if not found then
    raise exception 'Outbox event not found';
  end if;

  if v_event.attempts >= v_event.max_attempts then
    v_next_status := 'DEAD_LETTER';
  else
    v_next_status := 'RETRY';
  end if;

  v_delay_seconds := least(86400, greatest(30, power(2, greatest(v_event.attempts, 1))::integer * 30));

  update public.event_outbox
  set
    status = v_next_status,
    next_retry_at = case when v_next_status = 'RETRY' then now() + make_interval(secs => v_delay_seconds) else next_retry_at end,
    locked_at = null,
    locked_by = null,
    last_error = left(coalesce(_error_message, 'Handler failed'), 5000),
    last_error_code = left(coalesce(_error_code, 'HANDLER_FAILED'), 120)
  where id = v_event.id;

  perform public.event_outbox_record_attempt(
    v_event.id,
    case when v_next_status = 'DEAD_LETTER' then 'DEAD_LETTER' else 'FAILED' end,
    _worker_id,
    _latency_ms,
    _error_code,
    _error_message
  );

  if v_next_status = 'DEAD_LETTER' then
    insert into public.dead_letter_events (
      outbox_id,
      tenant_id,
      event_type,
      handler_name,
      payload,
      attempts,
      last_error,
      last_error_code,
      request_trace_id,
      operation_trace_id,
      workflow_trace_id
    )
    values (
      v_event.id,
      v_event.tenant_id,
      v_event.event_type,
      v_event.handler_name,
      v_event.payload,
      v_event.attempts,
      left(coalesce(_error_message, 'Handler failed'), 5000),
      left(coalesce(_error_code, 'HANDLER_FAILED'), 120),
      v_event.request_trace_id,
      v_event.operation_trace_id,
      v_event.workflow_trace_id
    )
    on conflict (outbox_id) do update
    set
      attempts = excluded.attempts,
      last_error = excluded.last_error,
      last_error_code = excluded.last_error_code,
      dead_lettered_at = now();
  end if;

  return v_next_status;
end;
$function$;

create or replace function public.admin_event_outbox_summary(_tenant_id uuid default null)
returns table (
  backlog_count bigint,
  processing_count bigint,
  retry_count bigint,
  failed_count bigint,
  delivered_count bigint,
  dead_letter_count bigint,
  oldest_undelivered_at timestamptz,
  oldest_undelivered_age_seconds integer,
  avg_delivery_latency_ms numeric
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin'::app_role) then
    raise exception 'Only super admins can view event outbox operations' using errcode = '42501';
  end if;

  return query
  select
    count(*) filter (where o.status = 'PENDING')::bigint,
    count(*) filter (where o.status = 'PROCESSING')::bigint,
    count(*) filter (where o.status = 'RETRY')::bigint,
    count(*) filter (where o.status = 'FAILED')::bigint,
    count(*) filter (where o.status = 'DELIVERED')::bigint,
    count(*) filter (where o.status = 'DEAD_LETTER')::bigint,
    min(o.created_at) filter (where o.status in ('PENDING', 'PROCESSING', 'RETRY', 'FAILED', 'DEAD_LETTER')),
    coalesce(extract(epoch from (now() - min(o.created_at) filter (where o.status in ('PENDING', 'PROCESSING', 'RETRY', 'FAILED', 'DEAD_LETTER'))))::integer, 0),
    avg(extract(epoch from (o.processed_at - o.created_at)) * 1000) filter (where o.status = 'DELIVERED' and o.processed_at is not null)
  from public.event_outbox o
  where _tenant_id is null or o.tenant_id = _tenant_id;
end;
$function$;

create or replace function public.admin_recent_event_outbox(_limit integer default 20, _tenant_id uuid default null)
returns table (
  id uuid,
  tenant_id uuid,
  tenant_name text,
  event_type text,
  aggregate_type text,
  aggregate_id uuid,
  handler_name text,
  delivery_guarantee text,
  status text,
  attempts integer,
  max_attempts integer,
  next_retry_at timestamptz,
  processed_at timestamptz,
  last_error text,
  request_trace_id text,
  operation_trace_id text,
  workflow_trace_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin'::app_role) then
    raise exception 'Only super admins can view event outbox operations' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.tenant_id,
    t.name,
    o.event_type,
    o.aggregate_type,
    o.aggregate_id,
    o.handler_name,
    o.delivery_guarantee,
    o.status,
    o.attempts,
    o.max_attempts,
    o.next_retry_at,
    o.processed_at,
    o.last_error,
    o.request_trace_id,
    o.operation_trace_id,
    o.workflow_trace_id,
    o.created_at,
    o.updated_at
  from public.event_outbox o
  left join public.tenants t on t.id = o.tenant_id
  where (_tenant_id is null or o.tenant_id = _tenant_id)
    and o.status in ('PENDING', 'PROCESSING', 'RETRY', 'FAILED', 'DEAD_LETTER')
  order by
    case o.status
      when 'DEAD_LETTER' then 1
      when 'FAILED' then 2
      when 'RETRY' then 3
      when 'PROCESSING' then 4
      else 5
    end,
    o.updated_at desc
  limit least(greatest(coalesce(_limit, 20), 1), 100);
end;
$function$;

create or replace function public.admin_replay_event_outbox(_event_ids uuid[])
returns table (
  id uuid,
  status text,
  attempts integer,
  next_retry_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'super_admin'::app_role) then
    raise exception 'Only super admins can replay event delivery' using errcode = '42501';
  end if;

  if coalesce(array_length(_event_ids, 1), 0) = 0 then
    raise exception 'At least one outbox event id is required';
  end if;

  if array_length(_event_ids, 1) > 25 then
    raise exception 'Replay is limited to 25 events per request';
  end if;

  return query
  with updated as (
    update public.event_outbox o
    set
      status = 'RETRY',
      next_retry_at = now(),
      locked_at = null,
      locked_by = null,
      processed_at = null,
      last_error = null,
      last_error_code = null
    where o.id = any(_event_ids)
      and o.status in ('FAILED', 'DEAD_LETTER', 'RETRY')
    returning o.id, o.status, o.attempts, o.next_retry_at
  )
  select updated.id, updated.status, updated.attempts, updated.next_retry_at
  from updated;

  update public.dead_letter_events d
  set replayed_at = now(), replayed_by = auth.uid()
  where d.outbox_id = any(_event_ids);
end;
$function$;

create or replace function public.schedule_event_delivery_worker(
  _schedule text default '*/2 * * * *',
  _function_url text default null,
  _worker_secret text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  _job_id bigint;
  _headers jsonb;
begin
  if _function_url is null or length(trim(_function_url)) = 0 then
    raise exception 'Missing _function_url';
  end if;

  if _worker_secret is null or length(trim(_worker_secret)) < 16 then
    raise exception 'Missing or weak _worker_secret';
  end if;

  select jobid into _job_id
  from cron.job
  where jobname = 'event-delivery-worker'
  limit 1;

  if _job_id is not null then
    perform cron.unschedule(_job_id);
  end if;

  _headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-worker-secret', _worker_secret
  );

  perform cron.schedule(
    'event-delivery-worker',
    _schedule,
    format(
      'select net.http_post(url := %L, headers := %L::jsonb, body := %L::jsonb);',
      _function_url,
      _headers::text,
      jsonb_build_object('batch_size', 25)::text
    )
  );
end;
$function$;

revoke all on function public.enqueue_event_outbox_rows() from anon, authenticated;
revoke all on function public.is_event_delivery_worker() from anon, authenticated;
revoke all on function public.event_outbox_claim_batch(integer, text) from anon, authenticated;
revoke all on function public.event_outbox_record_attempt(uuid, text, text, integer, text, text) from anon, authenticated;
revoke all on function public.event_outbox_mark_delivered(uuid, text, integer) from anon, authenticated;
revoke all on function public.event_outbox_mark_failed(uuid, text, text, text, integer) from anon, authenticated;
revoke all on function public.schedule_event_delivery_worker(text, text, text) from anon, authenticated;
grant execute on function public.admin_event_outbox_summary(uuid) to authenticated;
grant execute on function public.admin_recent_event_outbox(integer, uuid) to authenticated;
grant execute on function public.admin_replay_event_outbox(uuid[]) to authenticated;

do $$
declare
  _secret text := current_setting('app.settings.event_delivery_worker_secret', true);
  _url text := current_setting('app.settings.event_delivery_worker_url', true);
begin
  if
    _secret is not null and length(trim(_secret)) >= 16
    and _url is not null and length(trim(_url)) > 0
  then
    perform public.schedule_event_delivery_worker('*/2 * * * *', _url, _secret);
  end if;
end;
$$;
