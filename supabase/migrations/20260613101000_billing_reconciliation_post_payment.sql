-- Wave D: extend billing reconciliation for refunds, reversals, and write-offs.
create or replace function public.run_billing_reconciliation(
  _tenant_id uuid,
  _window_start timestamptz,
  _window_end timestamptz,
  _dry_run boolean
)
returns table (
  run_id uuid,
  tenant_id uuid,
  checked_invoice_count bigint,
  checked_payment_count bigint,
  finding_count bigint,
  critical_count bigint,
  warning_count bigint,
  dry_run boolean,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_tenant_id uuid;
  v_is_super_admin boolean;
  v_tenant_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_run_id uuid;
  v_completed_at timestamptz := now();
begin
  v_actor_tenant_id := public.get_user_tenant_id(auth.uid());
  v_is_super_admin := public.has_role(auth.uid(), 'super_admin'::public.app_role);
  v_tenant_id := coalesce(_tenant_id, v_actor_tenant_id);
  v_window_end := coalesce(_window_end, now());
  v_window_start := coalesce(_window_start, v_window_end - interval '30 days');

  if v_tenant_id is null then
    raise exception 'Missing tenant context for billing reconciliation' using errcode = '42501';
  end if;

  if not v_is_super_admin and v_tenant_id <> v_actor_tenant_id then
    raise exception 'Tenant mismatch for billing reconciliation' using errcode = '42501';
  end if;

  if not (
    v_is_super_admin
    or public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'accountant'::public.app_role)
  ) then
    raise exception 'Billing reconciliation requires operator privileges' using errcode = '42501';
  end if;

  if v_window_start >= v_window_end then
    raise exception 'Billing reconciliation window is invalid';
  end if;

  drop table if exists pg_temp.billing_reconciliation_tmp;
  create temp table billing_reconciliation_tmp (
    tenant_id uuid not null,
    invoice_id uuid,
    payment_id uuid,
    idempotency_id uuid,
    finding_code text not null,
    severity text not null,
    evidence jsonb not null default '{}'::jsonb,
    request_trace_id text,
    operation_trace_id text,
    workflow_trace_id text
  ) on commit drop;

  insert into billing_reconciliation_tmp (
    tenant_id, invoice_id, finding_code, severity, evidence
  )
  select
    i.tenant_id,
    i.id,
    'INVOICE_PAYMENT_TOTAL_MISMATCH',
    'critical',
    jsonb_build_object(
      'invoice_amount_paid', round(coalesce(i.amount_paid, 0), 2),
      'summed_active_payments', round(coalesce(sum(ip.amount), 0), 2),
      'summed_refunds', round(coalesce(sum(ir.amount), 0), 2),
      'expected_net_paid', round(greatest(coalesce(sum(ip.amount), 0) - coalesce(sum(ir.amount), 0), 0), 2),
      'delta', round(coalesce(i.amount_paid, 0) - greatest(coalesce(sum(ip.amount), 0) - coalesce(sum(ir.amount), 0), 0), 2)
    )
  from public.invoices i
  left join public.invoice_payments ip
    on ip.invoice_id = i.id
    and ip.tenant_id = i.tenant_id
    and ip.reversed_at is null
  left join public.invoice_refunds ir
    on ir.invoice_id = i.id
    and ir.tenant_id = i.tenant_id
  where i.tenant_id = v_tenant_id
    and i.deleted_at is null
    and i.updated_at >= v_window_start
    and i.updated_at < v_window_end
  group by i.tenant_id, i.id, i.amount_paid
  having round(coalesce(i.amount_paid, 0), 2) <> round(greatest(coalesce(sum(ip.amount), 0) - coalesce(sum(ir.amount), 0), 0), 2);

  insert into billing_reconciliation_tmp (tenant_id, invoice_id, finding_code, severity, evidence)
  select i.tenant_id, i.id, 'REFUND_OVER_PAID', 'critical',
    jsonb_build_object(
      'amount_refunded', round(coalesce(i.amount_refunded, 0), 2),
      'summed_refunds', round(coalesce(sum(ir.amount), 0), 2),
      'summed_active_payments', round(coalesce(sum(ip.amount), 0), 2)
    )
  from public.invoices i
  left join public.invoice_payments ip on ip.invoice_id = i.id and ip.tenant_id = i.tenant_id and ip.reversed_at is null
  left join public.invoice_refunds ir on ir.invoice_id = i.id and ir.tenant_id = i.tenant_id
  where i.tenant_id = v_tenant_id and i.deleted_at is null
    and i.updated_at >= v_window_start and i.updated_at < v_window_end
  group by i.tenant_id, i.id, i.amount_refunded
  having coalesce(sum(ir.amount), 0) > coalesce(sum(ip.amount), 0);

  insert into billing_reconciliation_tmp (tenant_id, invoice_id, payment_id, finding_code, severity, evidence)
  select p.tenant_id, p.invoice_id, p.id, 'PAYMENT_REVERSAL_MISMATCH', 'critical',
    jsonb_build_object('payment_id', p.id, 'reversed_at', p.reversed_at, 'invoice_amount_paid', i.amount_paid)
  from public.invoice_payments p
  inner join public.invoices i on i.id = p.invoice_id and i.tenant_id = p.tenant_id
  where p.tenant_id = v_tenant_id and p.reversed_at is not null
    and p.reversed_at >= v_window_start and p.reversed_at < v_window_end
    and round(coalesce(i.amount_paid, 0), 2) <> round(greatest(
      (select coalesce(sum(ip2.amount), 0) from public.invoice_payments ip2 where ip2.invoice_id = i.id and ip2.tenant_id = i.tenant_id and ip2.reversed_at is null)
      - (select coalesce(sum(ir2.amount), 0) from public.invoice_refunds ir2 where ir2.invoice_id = i.id and ir2.tenant_id = i.tenant_id), 0), 2);

  insert into billing_reconciliation_tmp (tenant_id, invoice_id, finding_code, severity, evidence)
  select i.tenant_id, i.id, 'INVOICE_BALANCE_AFTER_REFUND_INVALID', 'warning',
    jsonb_build_object(
      'amount_refunded', round(coalesce(i.amount_refunded, 0), 2),
      'summed_refunds', round(coalesce(sum(ir.amount), 0), 2)
    )
  from public.invoices i
  left join public.invoice_refunds ir on ir.invoice_id = i.id and ir.tenant_id = i.tenant_id
  where i.tenant_id = v_tenant_id and i.deleted_at is null
    and i.updated_at >= v_window_start and i.updated_at < v_window_end
  group by i.tenant_id, i.id, i.amount_refunded
  having round(coalesce(i.amount_refunded, 0), 2) <> round(coalesce(sum(ir.amount), 0), 2);

  insert into billing_reconciliation_tmp (
    tenant_id, invoice_id, finding_code, severity, evidence
  )
  select
    i.tenant_id,
    i.id,
    'INVOICE_BALANCE_INVALID',
    'critical',
    jsonb_build_object(
      'invoice_amount', round(coalesce(i.amount, 0), 2),
      'amount_paid', round(coalesce(i.amount_paid, 0), 2),
      'balance_due', round(coalesce(i.balance_due, 0), 2),
      'expected_balance_due', round(greatest(coalesce(i.amount, 0) - coalesce(i.amount_paid, 0), 0), 2)
    )
  from public.invoices i
  where i.tenant_id = v_tenant_id
    and i.deleted_at is null
    and i.updated_at >= v_window_start
    and i.updated_at < v_window_end
    and (
      coalesce(i.amount, 0) < 0
      or coalesce(i.amount_paid, 0) < 0
      or coalesce(i.balance_due, 0) < 0
      or coalesce(i.amount_paid, 0) > coalesce(i.amount, 0)
      or round(coalesce(i.balance_due, 0), 2) <> round(greatest(coalesce(i.amount, 0) - coalesce(i.amount_paid, 0), 0), 2)
    );

  insert into billing_reconciliation_tmp (
    tenant_id, invoice_id, finding_code, severity, evidence
  )
  select
    i.tenant_id,
    i.id,
    'INVOICE_STATUS_MISMATCH',
    'warning',
    jsonb_build_object(
      'status', i.status,
      'expected_status',
      case
        when i.status = 'void' then 'void'
        when coalesce(i.amount_paid, 0) >= coalesce(i.amount, 0) and coalesce(i.balance_due, 0) = 0 then 'paid'
        when coalesce(i.amount_paid, 0) > 0 then 'partially_paid'
        when i.due_date is not null and i.due_date < current_date then 'overdue'
        else 'pending'
      end,
      'amount_paid', round(coalesce(i.amount_paid, 0), 2),
      'balance_due', round(coalesce(i.balance_due, 0), 2)
    )
  from public.invoices i
  where i.tenant_id = v_tenant_id
    and i.deleted_at is null
    and i.updated_at >= v_window_start
    and i.updated_at < v_window_end
    and i.status <> case
      when i.status = 'void' then 'void'
      when coalesce(i.amount_paid, 0) >= coalesce(i.amount, 0) and coalesce(i.balance_due, 0) = 0 then 'paid'
      when coalesce(i.amount_paid, 0) > 0 then 'partially_paid'
      when i.due_date is not null and i.due_date < current_date then 'overdue'
      else 'pending'
    end;

  insert into billing_reconciliation_tmp (
    tenant_id, invoice_id, payment_id, finding_code, severity, evidence
  )
  select
    p.tenant_id,
    p.invoice_id,
    p.id,
    'PAYMENT_ORPHANED_OR_TENANT_MISMATCH',
    'critical',
    jsonb_build_object(
      'payment_amount', round(coalesce(p.amount, 0), 2),
      'payment_tenant_id', p.tenant_id,
      'invoice_tenant_id', i.tenant_id,
      'invoice_deleted', i.deleted_at is not null
    )
  from public.invoice_payments p
  left join public.invoices i
    on i.id = p.invoice_id
  where p.tenant_id = v_tenant_id
    and p.paid_at >= v_window_start
    and p.paid_at < v_window_end
    and (
      i.id is null
      or i.tenant_id <> p.tenant_id
      or i.deleted_at is not null
    );

  insert into billing_reconciliation_tmp (
    tenant_id, idempotency_id, finding_code, severity, evidence, request_trace_id, operation_trace_id, workflow_trace_id
  )
  select
    c.tenant_id,
    c.id,
    'IDEMPOTENCY_KEY_STALE_STARTED',
    'warning',
    jsonb_build_object(
      'operation_type', c.operation_type,
      'status', c.status,
      'age_seconds', extract(epoch from (now() - c.updated_at))::bigint
    ),
    c.request_trace_id,
    c.operation_trace_id,
    c.workflow_trace_id
  from public.command_idempotency c
  where c.tenant_id = v_tenant_id
    and c.operation_type = 'invoice_payment_post'
    and c.status = 'started'
    and c.updated_at < now() - interval '15 minutes';

  insert into billing_reconciliation_tmp (
    tenant_id, invoice_id, payment_id, idempotency_id, finding_code, severity, evidence, request_trace_id, operation_trace_id, workflow_trace_id
  )
  select
    c.tenant_id,
    case
      when (c.response_payload #>> '{invoice,id}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (c.response_payload #>> '{invoice,id}')::uuid
      else null
    end,
    case
      when (c.response_payload #>> '{payment,id}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (c.response_payload #>> '{payment,id}')::uuid
      else null
    end,
    c.id,
    'IDEMPOTENCY_PAYLOAD_INVALID',
    'critical',
    jsonb_build_object(
      'operation_type', c.operation_type,
      'status', c.status,
      'has_invoice_payload', c.response_payload ? 'invoice',
      'has_payment_payload', c.response_payload ? 'payment'
    ),
    c.request_trace_id,
    c.operation_trace_id,
    c.workflow_trace_id
  from public.command_idempotency c
  where c.tenant_id = v_tenant_id
    and c.operation_type = 'invoice_payment_post'
    and c.status = 'committed'
    and (
      c.response_payload is null
      or not (c.response_payload ? 'invoice')
      or not (c.response_payload ? 'payment')
      or nullif(c.response_payload #>> '{invoice,id}', '') is null
      or nullif(c.response_payload #>> '{payment,id}', '') is null
    );

  insert into billing_reconciliation_tmp (
    tenant_id, invoice_id, payment_id, idempotency_id, finding_code, severity, evidence, request_trace_id, operation_trace_id, workflow_trace_id
  )
  select
    c.tenant_id,
    case
      when (c.response_payload #>> '{invoice,id}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (c.response_payload #>> '{invoice,id}')::uuid
      else null
    end,
    case
      when (c.response_payload #>> '{payment,id}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (c.response_payload #>> '{payment,id}')::uuid
      else null
    end,
    c.id,
    'IDEMPOTENCY_DUPLICATE_COMMITTED_PAYMENT',
    'critical',
    jsonb_build_object(
      'operation_type', c.operation_type,
      'payment_id', c.response_payload #>> '{payment,id}',
      'duplicate_count', d.duplicate_count
    ),
    c.request_trace_id,
    c.operation_trace_id,
    c.workflow_trace_id
  from public.command_idempotency c
  inner join (
    select
      ci.tenant_id,
      ci.response_payload #>> '{payment,id}' as payment_id,
      count(*) as duplicate_count
    from public.command_idempotency ci
    where ci.tenant_id = v_tenant_id
      and ci.operation_type = 'invoice_payment_post'
      and ci.status = 'committed'
      and nullif(ci.response_payload #>> '{payment,id}', '') is not null
    group by ci.tenant_id, ci.response_payload #>> '{payment,id}'
    having count(*) > 1
  ) d
    on d.tenant_id = c.tenant_id
    and d.payment_id = c.response_payload #>> '{payment,id}'
  where c.tenant_id = v_tenant_id
    and c.operation_type = 'invoice_payment_post'
    and c.status = 'committed';

  if not coalesce(_dry_run, false) then
    insert into public.billing_reconciliation_runs (
      tenant_id,
      window_start,
      window_end,
      checked_invoice_count,
      checked_payment_count,
      finding_count,
      critical_count,
      warning_count,
      status,
      completed_at
    )
    values (
      v_tenant_id,
      v_window_start,
      v_window_end,
      (
        select count(*)
        from public.invoices i
        where i.tenant_id = v_tenant_id
          and i.deleted_at is null
          and i.updated_at >= v_window_start
          and i.updated_at < v_window_end
      ),
      (
        select count(*)
        from public.invoice_payments p
        where p.tenant_id = v_tenant_id
          and p.paid_at >= v_window_start
          and p.paid_at < v_window_end
      ),
      (select count(*) from billing_reconciliation_tmp),
      (select count(*) from billing_reconciliation_tmp where severity = 'critical'),
      (select count(*) from billing_reconciliation_tmp where severity = 'warning'),
      'completed',
      v_completed_at
    )
    returning id into v_run_id;

    insert into public.billing_reconciliation_findings (
      run_id,
      tenant_id,
      invoice_id,
      payment_id,
      idempotency_id,
      finding_code,
      severity,
      evidence,
      request_trace_id,
      operation_trace_id,
      workflow_trace_id,
      detected_at
    )
    select
      v_run_id,
      t.tenant_id,
      t.invoice_id,
      t.payment_id,
      t.idempotency_id,
      t.finding_code,
      t.severity,
      t.evidence,
      t.request_trace_id,
      t.operation_trace_id,
      t.workflow_trace_id,
      v_completed_at
    from billing_reconciliation_tmp t;
  end if;

  run_id := v_run_id;
  tenant_id := v_tenant_id;
  checked_invoice_count := (
    select count(*)
    from public.invoices i
    where i.tenant_id = v_tenant_id
      and i.deleted_at is null
      and i.updated_at >= v_window_start
      and i.updated_at < v_window_end
  );
  checked_payment_count := (
    select count(*)
    from public.invoice_payments p
    where p.tenant_id = v_tenant_id
      and p.paid_at >= v_window_start
      and p.paid_at < v_window_end
  );
  finding_count := (select count(*) from billing_reconciliation_tmp);
  critical_count := (select count(*) from billing_reconciliation_tmp where severity = 'critical');
  warning_count := (select count(*) from billing_reconciliation_tmp where severity = 'warning');
  dry_run := coalesce(_dry_run, false);
  completed_at := v_completed_at;
  return next;
end;
$function$;
