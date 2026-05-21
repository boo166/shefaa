-- Operational evidence convergence: persisted lineage and semantic metadata
-- across existing runtime, reconciliation, recovery, and outbox primitives.

alter table public.domain_events
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists replay_safe boolean,
  add column if not exists requires_reconciliation boolean,
  add column if not exists requires_operator boolean,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.command_idempotency
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists replay_safe boolean,
  add column if not exists requires_reconciliation boolean,
  add column if not exists requires_operator boolean,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.event_outbox
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists replay_safe boolean,
  add column if not exists requires_reconciliation boolean,
  add column if not exists requires_operator boolean,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.event_delivery_attempts
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists replay_safe boolean,
  add column if not exists requires_reconciliation boolean,
  add column if not exists requires_operator boolean,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.dead_letter_events
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists replay_safe boolean,
  add column if not exists requires_reconciliation boolean,
  add column if not exists requires_operator boolean,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.billing_reconciliation_runs
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists recovery_contract jsonb not null default '{}'::jsonb,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.billing_reconciliation_findings
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists recovery_contract jsonb not null default '{}'::jsonb,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.runtime_transition_log
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists recovery_contract jsonb not null default '{}'::jsonb,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.runtime_incident_timeline
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists recovery_contract jsonb not null default '{}'::jsonb,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

alter table public.runtime_recovery_actions
  add column if not exists causal_parent_id text,
  add column if not exists failure_kind text,
  add column if not exists runtime_effect text,
  add column if not exists recovery_contract jsonb not null default '{}'::jsonb,
  add column if not exists evidence_metadata jsonb not null default '{}'::jsonb;

update public.domain_events
set
  causal_parent_id = coalesce(causal_parent_id, workflow_trace_id, operation_trace_id, request_trace_id),
  failure_kind = coalesce(failure_kind, 'transient'),
  runtime_effect = coalesce(runtime_effect, 'none'),
  replay_safe = coalesce(replay_safe, true),
  requires_reconciliation = coalesce(requires_reconciliation, false),
  requires_operator = coalesce(requires_operator, false);

update public.command_idempotency
set
  causal_parent_id = coalesce(causal_parent_id, workflow_trace_id, operation_trace_id, request_trace_id),
  failure_kind = coalesce(failure_kind, case when status like 'failed%' then 'semantic_divergence' else 'transient' end),
  runtime_effect = coalesce(runtime_effect, case when status like 'failed%' then 'operator_required' else 'none' end),
  replay_safe = coalesce(replay_safe, status not like 'failed%'),
  requires_reconciliation = coalesce(requires_reconciliation, false),
  requires_operator = coalesce(requires_operator, status = 'failed_terminal');

create or replace function public.apply_command_idempotency_operational_evidence()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.causal_parent_id := coalesce(new.causal_parent_id, new.workflow_trace_id, new.operation_trace_id, new.request_trace_id);
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.failure_kind := case when new.status like 'failed%' then 'semantic_divergence' else 'transient' end;
    new.runtime_effect := case when new.status like 'failed%' then 'operator_required' else 'none' end;
    new.replay_safe := new.status not like 'failed%';
  else
    new.failure_kind := coalesce(new.failure_kind, 'transient');
    new.runtime_effect := coalesce(new.runtime_effect, 'none');
    new.replay_safe := coalesce(new.replay_safe, true);
  end if;
  new.requires_reconciliation := coalesce(new.requires_reconciliation, false);
  new.requires_operator := case
    when tg_op = 'INSERT' or new.status is distinct from old.status then new.status = 'failed_terminal'
    else coalesce(new.requires_operator, false)
  end;
  new.evidence_metadata := coalesce(new.evidence_metadata, '{}'::jsonb) || jsonb_build_object(
    'operation_type', new.operation_type,
    'status', new.status
  );
  return new;
end;
$function$;

drop trigger if exists apply_command_idempotency_operational_evidence on public.command_idempotency;
create trigger apply_command_idempotency_operational_evidence
before insert or update on public.command_idempotency
for each row execute function public.apply_command_idempotency_operational_evidence();

update public.event_outbox
set
  causal_parent_id = coalesce(causal_parent_id, workflow_trace_id, operation_trace_id, request_trace_id),
  failure_kind = coalesce(
    failure_kind,
    case
      when status = 'DEAD_LETTER' then 'operator_action_required'
      when status in ('FAILED', 'RETRY') then 'external_dependency'
      else 'transient'
    end
  ),
  runtime_effect = coalesce(
    runtime_effect,
    case
      when status = 'DEAD_LETTER' then 'operator_required'
      when status in ('FAILED', 'RETRY') then 'retry'
      else 'none'
    end
  ),
  replay_safe = coalesce(replay_safe, delivery_guarantee <> 'best_effort' and status <> 'DELIVERED'),
  requires_reconciliation = coalesce(requires_reconciliation, false),
  requires_operator = coalesce(requires_operator, status = 'DEAD_LETTER'),
  evidence_metadata = evidence_metadata || jsonb_build_object(
    'delivery_guarantee', delivery_guarantee,
    'handler_name', handler_name
  );

update public.event_delivery_attempts a
set
  causal_parent_id = coalesce(a.causal_parent_id, o.causal_parent_id, a.workflow_trace_id, a.operation_trace_id, a.request_trace_id),
  failure_kind = coalesce(
    a.failure_kind,
    case
      when a.status = 'DEAD_LETTER' then 'operator_action_required'
      when a.status = 'FAILED' then 'external_dependency'
      else 'transient'
    end
  ),
  runtime_effect = coalesce(
    a.runtime_effect,
    case
      when a.status = 'DEAD_LETTER' then 'operator_required'
      when a.status = 'FAILED' then 'retry'
      else 'none'
    end
  ),
  replay_safe = coalesce(a.replay_safe, o.delivery_guarantee <> 'best_effort' and a.status <> 'DELIVERED'),
  requires_reconciliation = coalesce(a.requires_reconciliation, false),
  requires_operator = coalesce(a.requires_operator, a.status = 'DEAD_LETTER')
from public.event_outbox o
where o.id = a.outbox_id;

update public.dead_letter_events d
set
  causal_parent_id = coalesce(d.causal_parent_id, o.causal_parent_id, d.workflow_trace_id, d.operation_trace_id, d.request_trace_id),
  failure_kind = coalesce(d.failure_kind, 'operator_action_required'),
  runtime_effect = coalesce(d.runtime_effect, 'operator_required'),
  replay_safe = coalesce(d.replay_safe, false),
  requires_reconciliation = coalesce(d.requires_reconciliation, false),
  requires_operator = coalesce(d.requires_operator, true)
from public.event_outbox o
where o.id = d.outbox_id;

update public.billing_reconciliation_runs
set
  causal_parent_id = coalesce(causal_parent_id, workflow_trace_id, operation_trace_id, request_trace_id),
  failure_kind = coalesce(failure_kind, case when status = 'failed' then 'external_dependency' else 'integrity_drift' end),
  runtime_effect = coalesce(runtime_effect, case when critical_count > 0 then 'reconcile' else 'none' end),
  recovery_contract = recovery_contract || jsonb_build_object(
    'automatic', true,
    'retryable', status = 'failed',
    'replaySafe', false,
    'requiresReconciliation', finding_count > 0,
    'requiresOperator', critical_count > 0
  );

update public.billing_reconciliation_findings
set
  causal_parent_id = coalesce(causal_parent_id, workflow_trace_id, operation_trace_id, request_trace_id),
  failure_kind = coalesce(failure_kind, 'integrity_drift'),
  runtime_effect = coalesce(runtime_effect, 'reconcile'),
  recovery_contract = recovery_contract || jsonb_build_object(
    'automatic', false,
    'retryable', false,
    'replaySafe', false,
    'requiresReconciliation', true,
    'requiresOperator', severity = 'critical'
  ),
  evidence_metadata = evidence_metadata || jsonb_build_object('finding_code', finding_code);

create or replace function public.apply_event_outbox_operational_evidence()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.causal_parent_id := coalesce(new.causal_parent_id, new.workflow_trace_id, new.operation_trace_id, new.request_trace_id);
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.failure_kind := case
      when new.status = 'DEAD_LETTER' then 'operator_action_required'
      when new.status in ('FAILED', 'RETRY') then 'external_dependency'
      else 'transient'
    end;
    new.runtime_effect := case
      when new.status = 'DEAD_LETTER' then 'operator_required'
      when new.status in ('FAILED', 'RETRY') then 'retry'
      else 'none'
    end;
    new.replay_safe := new.delivery_guarantee <> 'best_effort' and new.status <> 'DELIVERED';
  else
    new.failure_kind := coalesce(new.failure_kind, 'transient');
    new.runtime_effect := coalesce(new.runtime_effect, 'none');
    new.replay_safe := coalesce(new.replay_safe, new.delivery_guarantee <> 'best_effort' and new.status <> 'DELIVERED');
  end if;
  new.requires_reconciliation := coalesce(new.requires_reconciliation, false);
  new.requires_operator := case
    when tg_op = 'INSERT' or new.status is distinct from old.status then new.status = 'DEAD_LETTER'
    else coalesce(new.requires_operator, false)
  end;
  new.evidence_metadata := coalesce(new.evidence_metadata, '{}'::jsonb) || jsonb_build_object(
    'delivery_guarantee', new.delivery_guarantee,
    'handler_name', new.handler_name
  );
  return new;
end;
$function$;

drop trigger if exists apply_event_outbox_operational_evidence on public.event_outbox;
create trigger apply_event_outbox_operational_evidence
before insert or update on public.event_outbox
for each row execute function public.apply_event_outbox_operational_evidence();

create or replace function public.apply_event_delivery_attempt_operational_evidence()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_outbox public.event_outbox%rowtype;
begin
  select * into v_outbox from public.event_outbox where id = new.outbox_id;

  new.causal_parent_id := coalesce(new.causal_parent_id, v_outbox.causal_parent_id, new.workflow_trace_id, new.operation_trace_id, new.request_trace_id);
  new.failure_kind := coalesce(
    new.failure_kind,
    case
      when new.status = 'DEAD_LETTER' then 'operator_action_required'
      when new.status = 'FAILED' then 'external_dependency'
      else 'transient'
    end
  );
  new.runtime_effect := coalesce(
    new.runtime_effect,
    case
      when new.status = 'DEAD_LETTER' then 'operator_required'
      when new.status = 'FAILED' then 'retry'
      else 'none'
    end
  );
  new.replay_safe := coalesce(new.replay_safe, coalesce(v_outbox.delivery_guarantee, 'at_least_once') <> 'best_effort' and new.status <> 'DELIVERED');
  new.requires_reconciliation := coalesce(new.requires_reconciliation, false);
  new.requires_operator := coalesce(new.requires_operator, new.status = 'DEAD_LETTER');
  new.evidence_metadata := coalesce(new.evidence_metadata, '{}'::jsonb) || jsonb_build_object(
    'outbox_id', new.outbox_id,
    'handler_name', new.handler_name
  );
  return new;
end;
$function$;

drop trigger if exists apply_event_delivery_attempt_operational_evidence on public.event_delivery_attempts;
create trigger apply_event_delivery_attempt_operational_evidence
before insert or update on public.event_delivery_attempts
for each row execute function public.apply_event_delivery_attempt_operational_evidence();

create index if not exists idx_event_outbox_causal_parent
  on public.event_outbox (tenant_id, causal_parent_id);
create index if not exists idx_event_delivery_attempts_causal_parent
  on public.event_delivery_attempts (tenant_id, causal_parent_id);
create index if not exists idx_billing_reconciliation_findings_causal_parent
  on public.billing_reconciliation_findings (tenant_id, causal_parent_id);
create index if not exists idx_runtime_incident_timeline_causal_parent
  on public.runtime_incident_timeline (tenant_id, causal_parent_id);
create index if not exists idx_runtime_recovery_actions_causal_parent
  on public.runtime_recovery_actions (tenant_id, causal_parent_id);

drop function if exists public.admin_recent_event_outbox(integer, uuid);

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
  last_error_code text,
  request_trace_id text,
  operation_trace_id text,
  workflow_trace_id text,
  causal_parent_id text,
  failure_kind text,
  runtime_effect text,
  replay_safe boolean,
  requires_reconciliation boolean,
  requires_operator boolean,
  evidence_metadata jsonb,
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
    o.last_error_code,
    o.request_trace_id,
    o.operation_trace_id,
    o.workflow_trace_id,
    o.causal_parent_id,
    o.failure_kind,
    o.runtime_effect,
    o.replay_safe,
    o.requires_reconciliation,
    o.requires_operator,
    o.evidence_metadata,
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

grant execute on function public.admin_recent_event_outbox(integer, uuid) to authenticated;
