create or replace function public.run_scheduled_billing_reconciliation(
  _scope text default 'all',
  _window interval default interval '30 days',
  _tenant_limit integer default 50,
  _minimum_interval interval default interval '15 minutes'
)
returns table (
  tenant_id uuid,
  result text,
  run_id uuid,
  finding_count bigint,
  critical_count bigint,
  warning_count bigint,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_tenant record;
  v_actor_id uuid;
  v_summary record;
  v_window_end timestamptz;
  v_window_start timestamptz;
  v_latest_run_status text;
  v_latest_run_completed_at timestamptz;
begin
  if _scope not in ('hot', 'all', 'full') then
    raise exception 'Invalid reconciliation scope: %', _scope;
  end if;

  if coalesce(_tenant_limit, 0) <= 0 then
    raise exception 'Tenant limit must be positive';
  end if;

  if _window is null or _window <= interval '0 seconds' then
    raise exception 'Reconciliation window must be positive';
  end if;

  for v_tenant in
    select t.id
    from public.tenants t
    where _scope in ('all', 'full')
      or exists (
        select 1
        from public.invoices i
        where i.tenant_id = t.id
          and i.updated_at >= now() - interval '1 hour'
      )
      or exists (
        select 1
        from public.invoice_payments p
        where p.tenant_id = t.id
          and p.paid_at >= now() - interval '1 hour'
      )
    order by t.created_at asc nulls last, t.id
    limit _tenant_limit
  loop
    tenant_id := v_tenant.id;
    result := null;
    run_id := null;
    finding_count := null;
    critical_count := null;
    warning_count := null;
    completed_at := null;

    if not pg_try_advisory_xact_lock(hashtext('billing_reconciliation:' || v_tenant.id::text)) then
      result := 'locked';
      return next;
      continue;
    end if;

    select r.status, r.completed_at
    into v_latest_run_status, v_latest_run_completed_at
    from public.billing_reconciliation_runs r
    where r.tenant_id = v_tenant.id
    order by r.completed_at desc
    limit 1;

    if v_latest_run_completed_at is not null
      and v_latest_run_completed_at > now() - _minimum_interval
    then
      result := case
        when v_latest_run_status = 'failed' then 'recent_failure'
        else 'minimum_interval'
      end;
      completed_at := v_latest_run_completed_at;
      return next;
      continue;
    end if;

    select p.user_id
    into v_actor_id
    from public.profiles p
    join public.user_roles ur on ur.user_id = p.user_id
    where p.tenant_id = v_tenant.id
      and ur.role in ('clinic_admin'::public.app_role, 'accountant'::public.app_role)
    order by case when ur.role = 'clinic_admin'::public.app_role then 0 else 1 end, p.created_at asc nulls last
    limit 1;

    if v_actor_id is null then
      result := 'no_operator';
      return next;
      continue;
    end if;

    begin
      v_window_end := now();
      v_window_start := case
        when _scope = 'full' then '-infinity'::timestamptz
        else v_window_end - _window
      end;

      perform set_config('request.jwt.claim.sub', v_actor_id::text, true);
      perform set_config('request.jwt.claim.role', 'authenticated', true);

      select *
      into v_summary
      from public.run_billing_reconciliation(v_tenant.id, v_window_start, v_window_end, false);

      result := 'completed';
      run_id := v_summary.run_id;
      finding_count := v_summary.finding_count;
      critical_count := v_summary.critical_count;
      warning_count := v_summary.warning_count;
      completed_at := v_summary.completed_at;
      return next;
    exception when others then
      insert into public.billing_reconciliation_runs (
        tenant_id,
        window_start,
        window_end,
        status,
        completed_at
      )
      values (
        v_tenant.id,
        coalesce(v_window_start, now() - coalesce(_window, interval '30 days')),
        coalesce(v_window_end, now()),
        'failed',
        now()
      )
      returning id into run_id;

      result := 'failed';
      finding_count := 0;
      critical_count := 0;
      warning_count := 0;
      completed_at := now();
      return next;
    end;
  end loop;
end;
$function$;

revoke execute on function public.run_scheduled_billing_reconciliation(text, interval, integer, interval)
from PUBLIC;

revoke execute on function public.run_scheduled_billing_reconciliation(text, interval, integer, interval)
from anon;

revoke execute on function public.run_scheduled_billing_reconciliation(text, interval, integer, interval)
from authenticated;

grant execute on function public.run_scheduled_billing_reconciliation(text, interval, integer, interval)
to service_role;
