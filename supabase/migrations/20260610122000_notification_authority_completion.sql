create table if not exists public.notification_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  window_start timestamptz not null default now() - interval '24 hours',
  window_end timestamptz not null default now(),
  finding_count integer not null default 0,
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  request_trace_id text null,
  operation_trace_id text null,
  workflow_trace_id text null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.notification_reconciliation_runs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  notification_id uuid null references public.notifications(id) on delete set null,
  outbox_id uuid null references public.event_outbox(id) on delete set null,
  finding_code text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  evidence jsonb not null default '{}'::jsonb,
  resolved_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_reconciliation_runs_tenant_time
  on public.notification_reconciliation_runs (tenant_id, created_at desc);

create index if not exists idx_notification_reconciliation_findings_tenant_code
  on public.notification_reconciliation_findings (tenant_id, finding_code, created_at desc);

create index if not exists idx_notification_reconciliation_findings_run
  on public.notification_reconciliation_findings (run_id);

alter table public.notification_reconciliation_runs enable row level security;
alter table public.notification_reconciliation_findings enable row level security;

drop policy if exists "Tenant admins can view notification reconciliation runs" on public.notification_reconciliation_runs;
create policy "Tenant admins can view notification reconciliation runs"
on public.notification_reconciliation_runs
for select to authenticated
using (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

drop policy if exists "Tenant admins can view notification reconciliation findings" on public.notification_reconciliation_findings;
create policy "Tenant admins can view notification reconciliation findings"
on public.notification_reconciliation_findings
for select to authenticated
using (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

drop function if exists public.run_notification_reconciliation(uuid, timestamptz, timestamptz, boolean, text, text, text);

create or replace function public.run_notification_reconciliation(
  p_tenant_id uuid,
  p_window_start timestamptz default now() - interval '24 hours',
  p_window_end timestamptz default now(),
  p_dry_run boolean default false,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  run_id uuid,
  finding_count integer,
  critical_count integer,
  warning_count integer
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_run_id uuid := gen_random_uuid();
  v_actor_id uuid := auth.uid();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for notification reconciliation' using errcode = '42501';
  end if;

  insert into public.notification_reconciliation_runs (
    id, tenant_id, window_start, window_end, request_trace_id, operation_trace_id, workflow_trace_id
  )
  values (v_run_id, p_tenant_id, p_window_start, p_window_end, p_request_trace_id, p_operation_trace_id, p_workflow_trace_id);

  insert into public.notification_reconciliation_findings (
    run_id, tenant_id, outbox_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    o.id,
    'pending_notification_outbox_past_sla',
    'warning',
    jsonb_build_object(
      'outbox_id', o.id,
      'event_type', o.event_type,
      'status', o.status,
      'attempts', o.attempts,
      'next_retry_at', o.next_retry_at,
      'created_at', o.created_at,
      'non_destructive', true
    )
  from public.event_outbox o
  where o.tenant_id = p_tenant_id
    and o.handler_name = 'notifications'
    and o.status in ('PENDING', 'PROCESSING', 'RETRY')
    and o.created_at between p_window_start and p_window_end
    and coalesce(o.next_retry_at, o.created_at) < p_window_end - interval '15 minutes';

  insert into public.notification_reconciliation_findings (
    run_id, tenant_id, outbox_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    o.id,
    'delivered_outbox_without_notification',
    'critical',
    jsonb_build_object(
      'outbox_id', o.id,
      'event_type', o.event_type,
      'processed_at', o.processed_at,
      'non_destructive', true
    )
  from public.event_outbox o
  where o.tenant_id = p_tenant_id
    and o.handler_name = 'notifications'
    and o.status = 'DELIVERED'
    and coalesce(o.processed_at, o.updated_at, o.created_at) between p_window_start and p_window_end
    and not exists (
      select 1
      from public.notifications n
      where n.tenant_id = o.tenant_id
        and n.source_outbox_id = o.id
    );

  insert into public.notification_reconciliation_findings (
    run_id, tenant_id, notification_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    n.id,
    'notification_missing_source_outbox',
    'critical',
    jsonb_build_object(
      'notification_id', n.id,
      'delivery_key', n.delivery_key,
      'source_outbox_id', n.source_outbox_id,
      'source_event_id', n.source_event_id,
      'non_destructive', true
    )
  from public.notifications n
  where n.tenant_id = p_tenant_id
    and n.created_at between p_window_start and p_window_end
    and n.source_outbox_id is not null
    and not exists (
      select 1
      from public.event_outbox o
      where o.id = n.source_outbox_id
        and o.tenant_id = n.tenant_id
    );

  insert into public.notification_reconciliation_findings (
    run_id, tenant_id, notification_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    n.id,
    'notification_missing_command_evidence',
    'warning',
    jsonb_build_object(
      'notification_id', n.id,
      'delivery_key', n.delivery_key,
      'type', n.type,
      'created_at', n.created_at,
      'non_destructive', true
    )
  from public.notifications n
  where n.tenant_id = p_tenant_id
    and n.created_at between p_window_start and p_window_end
    and n.source_event_id is null
    and n.source_outbox_id is null
    and not exists (
      select 1
      from public.audit_logs a
      where a.tenant_id = n.tenant_id
        and a.action = 'notification_delivered'
        and a.entity_id = n.id
    )
    and not exists (
      select 1
      from public.command_idempotency ci
      where ci.tenant_id = n.tenant_id
        and ci.operation_type = 'notification_delivery'
        and ci.response_payload->'notification'->>'id' = n.id::text
    );

  insert into public.notification_reconciliation_findings (
    run_id, tenant_id, notification_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    n.id,
    'notification_acknowledgement_inconsistent',
    'warning',
    jsonb_build_object(
      'notification_id', n.id,
      'delivery_key', n.delivery_key,
      'read', n.read,
      'acknowledged_at', n.acknowledged_at,
      'non_destructive', true
    )
  from public.notifications n
  where n.tenant_id = p_tenant_id
    and n.updated_at between p_window_start and p_window_end
    and n.read = true
    and n.acknowledged_at is null;

  insert into public.notification_reconciliation_findings (
    run_id, tenant_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    'duplicate_notification_delivery_key',
    'critical',
    jsonb_build_object(
      'delivery_key', d.delivery_key,
      'duplicate_count', d.duplicate_count,
      'non_destructive', true
    )
  from (
    select n.delivery_key, count(*) as duplicate_count
    from public.notifications n
    where n.tenant_id = p_tenant_id
      and n.created_at between p_window_start and p_window_end
    group by n.delivery_key
    having count(*) > 1
  ) d;

  select
    count(*)::integer,
    count(*) filter (where severity = 'critical')::integer,
    count(*) filter (where severity = 'warning')::integer
  into finding_count, critical_count, warning_count
  from public.notification_reconciliation_findings
  where notification_reconciliation_findings.run_id = v_run_id;

  update public.notification_reconciliation_runs
  set finding_count = run_notification_reconciliation.finding_count,
      critical_count = run_notification_reconciliation.critical_count,
      warning_count = run_notification_reconciliation.warning_count
  where id = v_run_id;

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    'notification_reconciliation_run',
    'notification_reconciliation',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'notification_reconciliation_run', 'notification_reconciliation_run', v_run_id, v_run_id,
    jsonb_build_object(
      'run_id', v_run_id,
      'finding_count', finding_count,
      'critical_count', critical_count,
      'warning_count', warning_count,
      'dry_run', p_dry_run,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('transactional_command', 'run_notification_reconciliation'),
    false
  );

  run_id := v_run_id;
  return next;
end;
$function$;

revoke all on function public.run_notification_reconciliation(uuid, timestamptz, timestamptz, boolean, text, text, text) from anon;
grant execute on function public.run_notification_reconciliation(uuid, timestamptz, timestamptz, boolean, text, text, text) to authenticated;
