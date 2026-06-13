-- Appointment queue / lifecycle reconciliation for production readiness review.

create table if not exists public.appointment_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  window_start timestamptz not null,
  window_end timestamptz not null,
  checked_appointment_count bigint not null default 0,
  checked_queue_count bigint not null default 0,
  finding_count bigint not null default 0,
  critical_count bigint not null default 0,
  warning_count bigint not null default 0,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  request_trace_id text,
  operation_trace_id text,
  workflow_trace_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_appointment_reconciliation_runs_tenant_completed
  on public.appointment_reconciliation_runs (tenant_id, completed_at desc);

create table if not exists public.appointment_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.appointment_reconciliation_runs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid,
  queue_id uuid,
  finding_code text not null,
  severity text not null check (severity in ('critical', 'warning')),
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE')),
  evidence jsonb not null default '{}'::jsonb,
  request_trace_id text,
  operation_trace_id text,
  workflow_trace_id text,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_appointment_reconciliation_findings_open
  on public.appointment_reconciliation_findings (tenant_id, status, severity, detected_at desc);

alter table public.appointment_reconciliation_runs enable row level security;
alter table public.appointment_reconciliation_findings enable row level security;

drop policy if exists "Appointment operators can view reconciliation runs" on public.appointment_reconciliation_runs;
create policy "Appointment operators can view reconciliation runs"
  on public.appointment_reconciliation_runs
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      tenant_id = public.get_user_tenant_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
        or public.has_role(auth.uid(), 'receptionist'::public.app_role)
        or public.has_role(auth.uid(), 'doctor'::public.app_role)
        or public.has_role(auth.uid(), 'nurse'::public.app_role)
      )
    )
  );

drop policy if exists "Appointment operators can view reconciliation findings" on public.appointment_reconciliation_findings;
create policy "Appointment operators can view reconciliation findings"
  on public.appointment_reconciliation_findings
  for select to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or (
      tenant_id = public.get_user_tenant_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
        or public.has_role(auth.uid(), 'receptionist'::public.app_role)
        or public.has_role(auth.uid(), 'doctor'::public.app_role)
        or public.has_role(auth.uid(), 'nurse'::public.app_role)
      )
    )
  );

create or replace function public.run_appointment_reconciliation(
  p_tenant_id uuid,
  p_window_start timestamptz default now() - interval '30 days',
  p_window_end timestamptz default now(),
  p_dry_run boolean default false,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  run_id uuid,
  finding_count bigint,
  critical_count bigint,
  warning_count bigint
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_run_id uuid := gen_random_uuid();
  v_checked_appointments bigint := 0;
  v_checked_queues bigint := 0;
  v_finding_count bigint := 0;
  v_critical_count bigint := 0;
  v_warning_count bigint := 0;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for appointment reconciliation' using errcode = '42501';
  end if;

  if not (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    or public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'receptionist'::public.app_role)
    or public.has_role(auth.uid(), 'doctor'::public.app_role)
    or public.has_role(auth.uid(), 'nurse'::public.app_role)
  ) then
    raise exception 'Appointment reconciliation requires operator privileges' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where q.id is not null)
  into v_checked_appointments, v_checked_queues
  from public.appointments a
  left join public.appointment_queue q on q.appointment_id = a.id and q.tenant_id = a.tenant_id
  where a.tenant_id = p_tenant_id
    and a.updated_at >= p_window_start
    and a.updated_at < p_window_end;

  drop table if exists pg_temp.appointment_reconciliation_tmp;
  create temp table appointment_reconciliation_tmp (
    appointment_id uuid,
    queue_id uuid,
    finding_code text not null,
    severity text not null,
    evidence jsonb not null default '{}'::jsonb
  ) on commit drop;

  insert into appointment_reconciliation_tmp (appointment_id, queue_id, finding_code, severity, evidence)
  select a.id, q.id, 'COMPLETED_WITH_ACTIVE_QUEUE', 'critical',
    jsonb_build_object('appointment_status', a.status, 'queue_status', q.status)
  from public.appointments a
  inner join public.appointment_queue q on q.appointment_id = a.id and q.tenant_id = a.tenant_id
  where a.tenant_id = p_tenant_id
    and a.status = 'completed'
    and q.status in ('waiting', 'called', 'in_service')
    and a.updated_at >= p_window_start and a.updated_at < p_window_end;

  insert into appointment_reconciliation_tmp (appointment_id, queue_id, finding_code, severity, evidence)
  select a.id, q.id, 'CANCELLED_WITH_ACTIVE_QUEUE', 'critical',
    jsonb_build_object('appointment_status', a.status, 'queue_status', q.status)
  from public.appointments a
  inner join public.appointment_queue q on q.appointment_id = a.id and q.tenant_id = a.tenant_id
  where a.tenant_id = p_tenant_id
    and a.status = 'cancelled'
    and q.status in ('waiting', 'called', 'in_service')
    and a.updated_at >= p_window_start and a.updated_at < p_window_end;

  insert into appointment_reconciliation_tmp (appointment_id, queue_id, finding_code, severity, evidence)
  select a.id, q.id, 'NO_SHOW_WITH_WAITING_QUEUE', 'warning',
    jsonb_build_object('appointment_status', a.status, 'queue_status', q.status)
  from public.appointments a
  inner join public.appointment_queue q on q.appointment_id = a.id and q.tenant_id = a.tenant_id
  where a.tenant_id = p_tenant_id
    and a.status = 'no_show'
    and q.status = 'waiting'
    and a.updated_at >= p_window_start and a.updated_at < p_window_end;

  insert into appointment_reconciliation_tmp (appointment_id, queue_id, finding_code, severity, evidence)
  select a.id, q.id, 'APPOINTMENT_QUEUE_STATUS_MISMATCH', 'warning',
    jsonb_build_object('appointment_status', a.status, 'queue_status', q.status)
  from public.appointments a
  inner join public.appointment_queue q on q.appointment_id = a.id and q.tenant_id = a.tenant_id
  where a.tenant_id = p_tenant_id
    and a.updated_at >= p_window_start and a.updated_at < p_window_end
    and (
      (a.status = 'completed' and q.status <> 'done')
      or (a.status = 'cancelled' and q.status not in ('done', 'no_show'))
      or (a.status = 'no_show' and q.status <> 'no_show')
      or (a.status = 'in_progress' and q.status not in ('called', 'in_service'))
    );

  select count(*), count(*) filter (where severity = 'critical'), count(*) filter (where severity = 'warning')
  into v_finding_count, v_critical_count, v_warning_count
  from appointment_reconciliation_tmp;

  if not p_dry_run then
    insert into public.appointment_reconciliation_runs (
      id, tenant_id, window_start, window_end,
      checked_appointment_count, checked_queue_count,
      finding_count, critical_count, warning_count,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      v_run_id, p_tenant_id, p_window_start, p_window_end,
      v_checked_appointments, v_checked_queues,
      v_finding_count, v_critical_count, v_warning_count,
      p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    );

    insert into public.appointment_reconciliation_findings (
      run_id, tenant_id, appointment_id, queue_id, finding_code, severity, evidence,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    select
      v_run_id, p_tenant_id, appointment_id, queue_id, finding_code, severity, evidence,
      p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    from appointment_reconciliation_tmp;
  end if;

  run_id := v_run_id;
  finding_count := v_finding_count;
  critical_count := v_critical_count;
  warning_count := v_warning_count;
  return next;
end;
$function$;

revoke all on function public.run_appointment_reconciliation(uuid, timestamptz, timestamptz, boolean, text, text, text) from anon;
grant execute on function public.run_appointment_reconciliation(uuid, timestamptz, timestamptz, boolean, text, text, text) to authenticated;
