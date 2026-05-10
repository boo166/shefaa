-- Persistent operational forensics. Live state remains in runtimeHealthStore;
-- these tables record sanitized incident and recovery history only.
create table if not exists public.runtime_incident_timeline (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  incident_type text not null,
  runtime_health text not null check (
    runtime_health in ('HEALTHY', 'DEGRADED', 'CONTAINED', 'RECOVERING', 'PARTITIONED', 'FAILED_SAFE')
  ),
  runtime_mode text not null check (
    runtime_mode in ('NORMAL', 'DEGRADED', 'READONLY', 'SAFE_MODE', 'INCIDENT', 'RECOVERY')
  ),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  trace_ids jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.runtime_recovery_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.runtime_incident_timeline(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  recovery_class text not null check (
    recovery_class in ('reconcile', 'rollback', 'invalidate', 'abort', 'rebuild', 'contain', 'manual_operator_action')
  ),
  action_status text not null check (action_status in ('started', 'completed', 'failed', 'operator_required')),
  triggered_by text not null check (triggered_by in ('automatic', 'operator')),
  trace_ids jsonb not null default '{}'::jsonb,
  action_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists runtime_incident_timeline_tenant_detected_idx
  on public.runtime_incident_timeline (tenant_id, detected_at desc);

create index if not exists runtime_incident_timeline_type_detected_idx
  on public.runtime_incident_timeline (incident_type, detected_at desc);

create index if not exists runtime_recovery_actions_incident_started_idx
  on public.runtime_recovery_actions (incident_id, started_at desc);

create index if not exists runtime_recovery_actions_tenant_started_idx
  on public.runtime_recovery_actions (tenant_id, started_at desc);

alter table public.runtime_incident_timeline enable row level security;
alter table public.runtime_recovery_actions enable row level security;

drop policy if exists "runtime_incident_timeline_insert_actor" on public.runtime_incident_timeline;
create policy "runtime_incident_timeline_insert_actor"
  on public.runtime_incident_timeline
  for insert
  to authenticated
  with check (actor_id is null or actor_id = auth.uid());

drop policy if exists "runtime_incident_timeline_select_operator" on public.runtime_incident_timeline;
create policy "runtime_incident_timeline_select_operator"
  on public.runtime_incident_timeline
  for select
  to authenticated
  using (
    actor_id = auth.uid()
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      tenant_id = public.get_user_tenant_id(auth.uid())
      and public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    )
  );

drop policy if exists "runtime_recovery_actions_insert_actor" on public.runtime_recovery_actions;
create policy "runtime_recovery_actions_insert_actor"
  on public.runtime_recovery_actions
  for insert
  to authenticated
  with check (actor_id is null or actor_id = auth.uid());

drop policy if exists "runtime_recovery_actions_select_operator" on public.runtime_recovery_actions;
create policy "runtime_recovery_actions_select_operator"
  on public.runtime_recovery_actions
  for select
  to authenticated
  using (
    actor_id = auth.uid()
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      tenant_id = public.get_user_tenant_id(auth.uid())
      and public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    )
  );
