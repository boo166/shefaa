-- Wave H: insurance business authority — duplicate claim guard + coverage validation

create table if not exists public.insurance_coverage_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payer text not null,
  service_code text not null,
  coverage_percent numeric(5,2) not null default 100
    check (coverage_percent > 0 and coverage_percent <= 100),
  effective_from date not null default current_date,
  effective_to date null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists idx_insurance_coverage_policies_tenant_lookup
  on public.insurance_coverage_policies (tenant_id, payer, service_code, is_active);

drop trigger if exists update_insurance_coverage_policies_updated_at on public.insurance_coverage_policies;
create trigger update_insurance_coverage_policies_updated_at
before update on public.insurance_coverage_policies
for each row execute function public.update_updated_at_column();

alter table public.insurance_coverage_policies enable row level security;

drop policy if exists "Tenant users can view insurance coverage policies" on public.insurance_coverage_policies;
create policy "Tenant users can view insurance coverage policies"
on public.insurance_coverage_policies
for select
to authenticated
using (tenant_id = public.get_user_tenant_id(auth.uid()));

drop policy if exists "Tenant admins can manage insurance coverage policies" on public.insurance_coverage_policies;
create policy "Tenant admins can manage insurance coverage policies"
on public.insurance_coverage_policies
for all
to authenticated
using (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'accountant'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
)
with check (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'accountant'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

create unique index if not exists idx_insurance_claims_active_duplicate_guard
  on public.insurance_claims (tenant_id, patient_id, service, claim_date)
  where deleted_at is null and status <> 'denied';

create or replace function public.validate_insurance_claim_coverage(
  p_tenant_id uuid,
  p_provider text,
  p_service text,
  p_claim_date date default current_date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.insurance_coverage_policies cp
    where cp.tenant_id = p_tenant_id
      and cp.is_active
      and lower(trim(cp.payer)) = lower(trim(p_provider))
      and lower(trim(cp.service_code)) = lower(trim(p_service))
      and cp.effective_from <= coalesce(p_claim_date, current_date)
      and (cp.effective_to is null or cp.effective_to >= coalesce(p_claim_date, current_date))
  );
$$;

drop function if exists public.command_insurance_claim(
  text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_insurance_claim(
  p_operation text,
  p_claim_id uuid,
  p_tenant_id uuid,
  p_payload jsonb default '{}'::jsonb,
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
  claim jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_claim public.insurance_claims%rowtype;
  v_previous public.insurance_claims%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_event_id uuid;
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_event_type text;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_started_at timestamptz := clock_timestamp();
  v_target_status text;
  v_patient_id uuid;
  v_provider text;
  v_service text;
  v_claim_date date;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for insurance claim command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'update', 'archive', 'restore', 'submit') then
    raise exception 'Unsupported insurance claim command operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'insurance_claim_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'insurance_claim_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Insurance claim command replayed';
      claim := v_idempotency.response_payload->'claim';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    if nullif(trim(coalesce(p_payload->>'patient_id', '')), '') is null then
      raise exception 'Insurance claim patient is required';
    end if;

    v_target_status := coalesce(nullif(p_payload->>'status', ''), 'draft');
    if v_target_status not in ('draft', 'submitted') then
      raise exception 'New insurance claims must start in draft or submitted status';
    end if;

    v_patient_id := (p_payload->>'patient_id')::uuid;
    v_provider := nullif(trim(coalesce(p_payload->>'provider', '')), '');
    v_service := nullif(trim(coalesce(p_payload->>'service', '')), '');
    v_claim_date := coalesce((p_payload->>'claim_date')::date, current_date);

    if v_target_status = 'submitted' then
      if v_provider is null or v_service is null then
        raise exception 'Submitted insurance claims require provider and service';
      end if;

      if not public.validate_insurance_claim_coverage(p_tenant_id, v_provider, v_service, v_claim_date) then
        raise exception 'No active insurance coverage policy matches this claim';
      end if;

      if exists (
        select 1
        from public.insurance_claims ic
        where ic.tenant_id = p_tenant_id
          and ic.patient_id = v_patient_id
          and ic.service = v_service
          and ic.claim_date = v_claim_date
          and ic.deleted_at is null
          and ic.status <> 'denied'
      ) then
        result_code := 'CONFLICT';
        retryable := false;
        idempotency_replay := false;
        message := 'Duplicate insurance claim for patient, service, and claim date';
        claim := null;
        return next;
        return;
      end if;
    end if;

    if (p_payload->>'assigned_to_user_id') is not null and not exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.user_id
      where p.user_id = (p_payload->>'assigned_to_user_id')::uuid
        and p.tenant_id = p_tenant_id
        and ur.role in ('clinic_admin', 'accountant')
    ) then
      raise exception 'Insurance claim assignee must be an accountant or clinic admin in the same tenant';
    end if;

    insert into public.insurance_claims (
      tenant_id, patient_id, provider, service, amount, claim_date, status,
      submitted_at, processing_started_at, approved_at, reimbursed_at, payer_reference,
      denial_reason, assigned_to_user_id, internal_notes, payer_notes,
      last_follow_up_at, next_follow_up_at, resubmission_count
    )
    values (
      p_tenant_id,
      v_patient_id,
      v_provider,
      v_service,
      coalesce((p_payload->>'amount')::numeric, 0),
      v_claim_date,
      v_target_status,
      case when v_target_status = 'submitted' then coalesce((p_payload->>'submitted_at')::timestamptz, now()) else null end,
      null,
      null,
      null,
      null,
      null,
      nullif(p_payload->>'assigned_to_user_id', '')::uuid,
      nullif(trim(coalesce(p_payload->>'internal_notes', '')), ''),
      nullif(trim(coalesce(p_payload->>'payer_notes', '')), ''),
      nullif(p_payload->>'last_follow_up_at', '')::timestamptz,
      nullif(p_payload->>'next_follow_up_at', '')::timestamptz,
      coalesce((p_payload->>'resubmission_count')::integer, 0)
    )
    returning * into v_claim;
    v_event_type := 'InsuranceClaimCreated';
  else
    if p_claim_id is null then
      raise exception 'Insurance claim id is required';
    end if;

    select *
    into v_claim
    from public.insurance_claims
    where id = p_claim_id
      and tenant_id = p_tenant_id
    for update;

    if not found then
      raise exception 'Insurance claim not found' using errcode = 'P0002';
    end if;

    if p_expected_updated_at is not null and v_claim.updated_at <> p_expected_updated_at then
      result_code := 'CONFLICT';
      retryable := true;
      idempotency_replay := false;
      message := 'Insurance claim was modified by another user';
      claim := null;
      return next;
      return;
    end if;

    v_previous := v_claim;

    if (p_payload->>'assigned_to_user_id') is not null and not exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.user_id = p.user_id
      where p.user_id = (p_payload->>'assigned_to_user_id')::uuid
        and p.tenant_id = p_tenant_id
        and ur.role in ('clinic_admin', 'accountant')
    ) then
      raise exception 'Insurance claim assignee must be an accountant or clinic admin in the same tenant';
    end if;

    if v_operation = 'submit' then
      if v_claim.status <> 'draft' then
        raise exception 'Only draft insurance claims can be submitted';
      end if;

      if nullif(trim(coalesce(v_claim.provider, '')), '') is null
        or nullif(trim(coalesce(v_claim.service, '')), '') is null then
        raise exception 'Submitted insurance claims require provider and service';
      end if;

      if not public.validate_insurance_claim_coverage(
        p_tenant_id,
        v_claim.provider,
        v_claim.service,
        v_claim.claim_date
      ) then
        raise exception 'No active insurance coverage policy matches this claim';
      end if;

      if exists (
        select 1
        from public.insurance_claims ic
        where ic.tenant_id = p_tenant_id
          and ic.patient_id = v_claim.patient_id
          and ic.service = v_claim.service
          and ic.claim_date = v_claim.claim_date
          and ic.deleted_at is null
          and ic.status <> 'denied'
          and ic.id <> v_claim.id
      ) then
        result_code := 'CONFLICT';
        retryable := false;
        idempotency_replay := false;
        message := 'Duplicate insurance claim for patient, service, and claim date';
        claim := null;
        return next;
        return;
      end if;

      update public.insurance_claims
      set status = 'submitted',
          submitted_at = coalesce(submitted_at, now())
      where id = v_claim.id
        and tenant_id = p_tenant_id
      returning * into v_claim;
      v_event_type := 'InsuranceClaimSubmitted';
    elsif v_operation = 'archive' then
      update public.insurance_claims
      set deleted_at = now(), deleted_by = v_actor_id
      where id = v_claim.id and tenant_id = p_tenant_id
      returning * into v_claim;
      v_event_type := 'InsuranceClaimArchived';
    elsif v_operation = 'restore' then
      update public.insurance_claims
      set deleted_at = null, deleted_by = null
      where id = v_claim.id and tenant_id = p_tenant_id
      returning * into v_claim;
      v_event_type := 'InsuranceClaimRestored';
    else
      update public.insurance_claims
      set
        patient_id = case when p_payload ? 'patient_id' then (p_payload->>'patient_id')::uuid else patient_id end,
        provider = case when p_payload ? 'provider' then nullif(trim(coalesce(p_payload->>'provider', '')), '') else provider end,
        service = case when p_payload ? 'service' then nullif(trim(coalesce(p_payload->>'service', '')), '') else service end,
        amount = case when p_payload ? 'amount' then coalesce((p_payload->>'amount')::numeric, amount) else amount end,
        claim_date = case when p_payload ? 'claim_date' then coalesce((p_payload->>'claim_date')::date, claim_date) else claim_date end,
        assigned_to_user_id = case when p_payload ? 'assigned_to_user_id' then nullif(p_payload->>'assigned_to_user_id', '')::uuid else assigned_to_user_id end,
        internal_notes = case when p_payload ? 'internal_notes' then nullif(trim(coalesce(p_payload->>'internal_notes', '')), '') else internal_notes end,
        payer_notes = case when p_payload ? 'payer_notes' then nullif(trim(coalesce(p_payload->>'payer_notes', '')), '') else payer_notes end,
        last_follow_up_at = case when p_payload ? 'last_follow_up_at' then nullif(p_payload->>'last_follow_up_at', '')::timestamptz else last_follow_up_at end,
        next_follow_up_at = case when p_payload ? 'next_follow_up_at' then nullif(p_payload->>'next_follow_up_at', '')::timestamptz else next_follow_up_at end,
        resubmission_count = case when p_payload ? 'resubmission_count' then coalesce((p_payload->>'resubmission_count')::integer, resubmission_count) else resubmission_count end
      where id = v_claim.id and tenant_id = p_tenant_id
      returning * into v_claim;
      v_event_type := 'InsuranceClaimUpdated';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type, 1, 'insurance_claim', v_claim.id, p_tenant_id, v_actor_id,
    jsonb_build_object('claimId', v_claim.id, 'operation', v_operation, 'previous', to_jsonb(v_previous), 'claim', to_jsonb(v_claim)),
    p_request_trace_id, p_operation_trace_id, p_workflow_trace_id, null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    case v_operation
      when 'submit' then 'insurance_claim_submitted'
      else 'insurance_claim_' || v_operation || 'd'
    end,
    'insurance_claim_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'insurance_claim', 'insurance_claim', v_claim.id, v_claim.id,
    jsonb_build_object('claim_id', v_claim.id, 'operation', v_operation, 'domain_event_id', v_event_id, 'request_trace_id', p_request_trace_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_insurance_claim'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Insurance claim command committed';
  claim := to_jsonb(v_claim);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('claim', claim, 'domain_event_id', v_event_id),
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
    jsonb_build_object('command', 'command_insurance_claim', 'operation', v_operation, 'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer, 'claim_id', v_claim.id, 'domain_event_id', v_event_id, 'operation_trace_id', p_operation_trace_id, 'workflow_trace_id', p_workflow_trace_id)
  );

  return next;
end;
$function$;

revoke all on function public.validate_insurance_claim_coverage(uuid, text, text, date) from anon;
grant execute on function public.validate_insurance_claim_coverage(uuid, text, text, date) to authenticated;

grant execute on function public.command_insurance_claim(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
