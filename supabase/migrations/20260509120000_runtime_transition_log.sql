-- Append-only client coordination forensics (kernel writes via authenticated user).
create table if not exists public.runtime_transition_log (
  id uuid primary key default gen_random_uuid(),
  transition_id text not null unique,
  runtime_epoch integer not null,
  transition_type text not null,
  tenant_id uuid,
  actor_id uuid,
  started_at timestamptz not null,
  completed_at timestamptz,
  failed_at timestamptz,
  rollback_triggered boolean not null default false,
  trace_id text,
  runtime_transition_trace_id text,
  status text not null,
  created_at timestamptz not null default now()
);

create index if not exists runtime_transition_log_tenant_started_idx
  on public.runtime_transition_log (tenant_id, started_at desc);
create index if not exists runtime_transition_log_status_started_idx
  on public.runtime_transition_log (status, started_at desc);

alter table public.runtime_transition_log enable row level security;

create policy "runtime_transition_log_insert_own_actor"
  on public.runtime_transition_log
  for insert
  to authenticated
  with check (actor_id = auth.uid());

create policy "runtime_transition_log_select_own_actor"
  on public.runtime_transition_log
  for select
  to authenticated
  using (actor_id = auth.uid());
