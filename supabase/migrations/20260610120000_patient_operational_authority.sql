create table if not exists public.patient_retention_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  active_retention_years integer not null default 10 check (active_retention_years > 0),
  archived_retention_years integer not null default 10 check (archived_retention_years > 0),
  soft_deleted_retention_years integer not null default 10 check (soft_deleted_retention_years > 0),
  legal_hold_patient_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

drop trigger if exists update_patient_retention_policies_updated_at on public.patient_retention_policies;
create trigger update_patient_retention_policies_updated_at
before update on public.patient_retention_policies
for each row execute function public.update_updated_at_column();

alter table public.patient_retention_policies enable row level security;

drop policy if exists "Tenant admins can view patient retention policies" on public.patient_retention_policies;
create policy "Tenant admins can view patient retention policies"
on public.patient_retention_policies
for select
to authenticated
using (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

drop policy if exists "Tenant admins can manage patient retention policies" on public.patient_retention_policies;
create policy "Tenant admins can manage patient retention policies"
on public.patient_retention_policies
for all
to authenticated
using (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
)
with check (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

create table if not exists public.patient_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  window_start timestamptz not null default now(),
  window_end timestamptz not null default now(),
  finding_count integer not null default 0,
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  request_trace_id text null,
  operation_trace_id text null,
  workflow_trace_id text null,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.patient_reconciliation_runs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  patient_id uuid null references public.patients(id) on delete set null,
  related_entity_type text null,
  related_entity_id uuid null,
  finding_code text not null,
  severity text not null check (severity in ('critical', 'warning', 'info')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by uuid null
);

create index if not exists idx_patient_reconciliation_runs_tenant_time
  on public.patient_reconciliation_runs (tenant_id, created_at desc);

create index if not exists idx_patient_reconciliation_findings_tenant_status
  on public.patient_reconciliation_findings (tenant_id, status, created_at desc);

alter table public.patient_reconciliation_runs enable row level security;
alter table public.patient_reconciliation_findings enable row level security;

drop policy if exists "Tenant admins can view patient reconciliation runs" on public.patient_reconciliation_runs;
create policy "Tenant admins can view patient reconciliation runs"
on public.patient_reconciliation_runs
for select
to authenticated
using (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

drop policy if exists "Tenant admins can view patient reconciliation findings" on public.patient_reconciliation_findings;
create policy "Tenant admins can view patient reconciliation findings"
on public.patient_reconciliation_findings
for select
to authenticated
using (
  tenant_id = public.get_user_tenant_id(auth.uid())
  and (
    public.has_role(auth.uid(), 'clinic_admin'::public.app_role)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

drop function if exists public.command_patient_lifecycle(
  text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text
);

create or replace function public.command_patient_lifecycle(
  p_operation text,
  p_patient_id uuid default null,
  p_tenant_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_expected_updated_at timestamptz default null,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_user_id uuid default null,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  result_code text,
  retryable boolean,
  idempotency_replay boolean,
  message text,
  patient jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_patient public.patients%rowtype;
  v_previous public.patients%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_event_type text;
  v_event_id uuid;
  v_bulk_count integer := 0;
  v_bulk_entity_id uuid;
  v_started_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for patient lifecycle command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'update', 'archive', 'restore', 'bulk_archive') then
    raise exception 'Unsupported patient lifecycle operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'patient_lifecycle_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'patient_lifecycle_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Patient lifecycle command replayed';
      patient := v_idempotency.response_payload->'patient';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    if nullif(trim(coalesce(v_payload->>'full_name', '')), '') is null then
      raise exception 'Patient create requires full_name';
    end if;

    insert into public.patients (
      tenant_id, patient_code, full_name, date_of_birth, gender, blood_type,
      phone, email, address, insurance_provider, status
    )
    values (
      p_tenant_id,
      nullif(trim(coalesce(v_payload->>'patient_code', '')), ''),
      nullif(trim(v_payload->>'full_name'), ''),
      nullif(v_payload->>'date_of_birth', '')::date,
      nullif(v_payload->>'gender', ''),
      nullif(v_payload->>'blood_type', ''),
      nullif(v_payload->>'phone', ''),
      nullif(v_payload->>'email', ''),
      nullif(v_payload->>'address', ''),
      nullif(v_payload->>'insurance_provider', ''),
      coalesce(nullif(v_payload->>'status', ''), 'active')
    )
    returning * into v_patient;

    v_event_type := 'PatientRegistered';

  elsif v_operation = 'bulk_archive' then
    if jsonb_typeof(v_payload->'patient_ids') <> 'array' then
      raise exception 'Bulk archive requires patient_ids';
    end if;

    select id::uuid
    into v_bulk_entity_id
    from jsonb_array_elements_text(v_payload->'patient_ids') ids(id)
    limit 1;

    if exists (
      select 1
      from jsonb_array_elements_text(v_payload->'patient_ids') ids(id)
      join public.appointments a on a.patient_id = ids.id::uuid
      where a.tenant_id = p_tenant_id
        and a.status in ('scheduled', 'in_progress', 'checked_in', 'called', 'in_service')
        and a.deleted_at is null
    ) then
      raise exception 'Cannot archive patients with active appointments';
    end if;

    update public.patients p
    set deleted_at = coalesce(p.deleted_at, now()),
        deleted_by = coalesce((v_payload->>'deleted_by')::uuid, v_actor_id)
    where p.tenant_id = p_tenant_id
      and p.id in (select id::uuid from jsonb_array_elements_text(v_payload->'patient_ids') ids(id));

    get diagnostics v_bulk_count = row_count;
    v_event_type := 'PatientsBulkArchived';

  else
    if p_patient_id is null then
      raise exception 'Patient id is required';
    end if;

    select *
    into v_patient
    from public.patients
    where id = p_patient_id
      and tenant_id = p_tenant_id
      and (v_operation = 'restore' or deleted_at is null)
    for update;

    if not found then
      raise exception 'Patient not found' using errcode = 'P0002';
    end if;

    if p_expected_updated_at is not null and v_patient.updated_at <> p_expected_updated_at then
      result_code := 'CONFLICT';
      retryable := true;
      idempotency_replay := false;
      message := 'Patient was modified by another user';
      patient := null;
      return next;
      return;
    end if;

    v_previous := v_patient;

    if v_operation in ('archive', 'update') then
      if (
        v_operation = 'archive'
        or coalesce(v_payload->>'status', v_patient.status) = 'inactive'
      ) and exists (
        select 1
        from public.appointments a
        where a.tenant_id = p_tenant_id
          and a.patient_id = v_patient.id
          and a.status in ('scheduled', 'in_progress', 'checked_in', 'called', 'in_service')
          and a.deleted_at is null
      ) then
        raise exception 'Cannot archive or deactivate patient with active appointments';
      end if;
    end if;

    if v_operation = 'archive' then
      update public.patients
      set deleted_at = coalesce(deleted_at, now()),
          deleted_by = coalesce((v_payload->>'deleted_by')::uuid, v_actor_id)
      where id = v_patient.id
        and tenant_id = p_tenant_id
      returning * into v_patient;
      v_event_type := 'PatientArchived';

    elsif v_operation = 'restore' then
      update public.patients
      set deleted_at = null,
          deleted_by = null
      where id = v_patient.id
        and tenant_id = p_tenant_id
      returning * into v_patient;
      v_event_type := 'PatientRestored';

    else
      update public.patients
      set full_name = coalesce(nullif(trim(v_payload->>'full_name'), ''), full_name),
          date_of_birth = case when v_payload ? 'date_of_birth' then nullif(v_payload->>'date_of_birth', '')::date else date_of_birth end,
          gender = case when v_payload ? 'gender' then nullif(v_payload->>'gender', '') else gender end,
          blood_type = case when v_payload ? 'blood_type' then nullif(v_payload->>'blood_type', '') else blood_type end,
          phone = case when v_payload ? 'phone' then nullif(v_payload->>'phone', '') else phone end,
          email = case when v_payload ? 'email' then nullif(v_payload->>'email', '') else email end,
          address = case when v_payload ? 'address' then nullif(v_payload->>'address', '') else address end,
          insurance_provider = case when v_payload ? 'insurance_provider' then nullif(v_payload->>'insurance_provider', '') else insurance_provider end,
          status = coalesce(nullif(v_payload->>'status', ''), status)
      where id = v_patient.id
        and tenant_id = p_tenant_id
      returning * into v_patient;
      v_event_type := 'PatientUpdated';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type,
    1,
    'patient',
    coalesce(v_patient.id, p_patient_id, v_bulk_entity_id),
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'patientId', coalesce(v_patient.id, p_patient_id, v_bulk_entity_id),
      'operation', v_operation,
      'previousStatus', case when v_operation in ('create', 'bulk_archive') then null else v_previous.status end,
      'status', case when v_operation = 'bulk_archive' then 'archived' else v_patient.status end,
      'bulkCount', case when v_operation = 'bulk_archive' then v_bulk_count else null end,
      'commandIdempotencyKey', p_idempotency_key
    ),
    p_request_trace_id,
    p_operation_trace_id,
    p_workflow_trace_id,
    null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    case v_operation
      when 'create' then 'patient_created'
      when 'update' then 'patient_updated'
      when 'archive' then 'patient_archived'
      when 'restore' then 'patient_restored'
      else 'patients_bulk_archived'
    end,
    'patient_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'patient', 'patient', coalesce(v_patient.id, p_patient_id, v_bulk_entity_id), coalesce(v_patient.id, p_patient_id, v_bulk_entity_id),
    jsonb_build_object(
      'patient_id', coalesce(v_patient.id, p_patient_id, v_bulk_entity_id),
      'operation', v_operation,
      'previous_status', case when v_operation in ('create', 'bulk_archive') then null else v_previous.status end,
      'status', case when v_operation = 'bulk_archive' then 'archived' else v_patient.status end,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_patient_lifecycle'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Patient lifecycle command committed';
  patient := case when v_operation = 'bulk_archive' then null else to_jsonb(v_patient) end;

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('patient', patient, 'domain_event_id', v_event_id, 'bulk_count', v_bulk_count),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'patient-operational-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object(
      'command', 'command_patient_lifecycle',
      'operation', v_operation,
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'patient_id', coalesce(v_patient.id, p_patient_id, v_bulk_entity_id),
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

drop function if exists public.command_patient_document_lifecycle(
  text, uuid, uuid, jsonb, text, text, uuid, text, text, text
);

create or replace function public.command_patient_document_lifecycle(
  p_operation text,
  p_document_id uuid default null,
  p_tenant_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_user_id uuid default null,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  result_code text,
  retryable boolean,
  idempotency_replay boolean,
  message text,
  document jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_document public.patient_documents%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_event_type text;
  v_event_id uuid;
  v_started_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for patient document command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'access', 'archive', 'restore', 'delete') then
    raise exception 'Unsupported patient document operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'patient_document_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'patient_document_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Patient document command replayed';
      document := v_idempotency.response_payload->'document';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    if not exists (
      select 1
      from public.patients p
      where p.id = (v_payload->>'patient_id')::uuid
        and p.tenant_id = p_tenant_id
        and p.deleted_at is null
    ) then
      raise exception 'Document patient does not belong to tenant' using errcode = '42501';
    end if;

    insert into public.patient_documents (
      patient_id, tenant_id, file_name, file_path, file_size, file_type, uploaded_by, notes
    )
    values (
      (v_payload->>'patient_id')::uuid,
      p_tenant_id,
      nullif(trim(v_payload->>'file_name'), ''),
      nullif(trim(v_payload->>'file_path'), ''),
      coalesce((v_payload->>'file_size')::integer, 0),
      coalesce(nullif(trim(v_payload->>'file_type'), ''), 'application/octet-stream'),
      coalesce((v_payload->>'uploaded_by')::uuid, v_actor_id),
      nullif(v_payload->>'notes', '')
    )
    returning * into v_document;
    v_event_type := 'PatientDocumentUploaded';

  else
    if p_document_id is null then
      raise exception 'Document id is required';
    end if;

    select *
    into v_document
    from public.patient_documents
    where id = p_document_id
      and tenant_id = p_tenant_id
      and (v_operation = 'restore' or deleted_at is null)
    for update;

    if not found then
      raise exception 'Patient document not found' using errcode = 'P0002';
    end if;

    if v_operation = 'archive' or v_operation = 'delete' then
      update public.patient_documents
      set deleted_at = coalesce(deleted_at, now()),
          deleted_by = coalesce((v_payload->>'deleted_by')::uuid, v_actor_id)
      where id = v_document.id
        and tenant_id = p_tenant_id
      returning * into v_document;
      v_event_type := 'PatientDocumentDeleted';
    elsif v_operation = 'restore' then
      update public.patient_documents
      set deleted_at = null,
          deleted_by = null
      where id = v_document.id
        and tenant_id = p_tenant_id
      returning * into v_document;
      v_event_type := 'PatientDocumentRestored';
    else
      v_event_type := 'PatientDocumentAccessed';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type,
    1,
    'patient_document',
    v_document.id,
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'documentId', v_document.id,
      'patientId', v_document.patient_id,
      'operation', v_operation,
      'filePath', v_document.file_path,
      'commandIdempotencyKey', p_idempotency_key
    ),
    p_request_trace_id,
    p_operation_trace_id,
    p_workflow_trace_id,
    null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    case v_operation
      when 'create' then 'patient_document_uploaded'
      when 'access' then 'patient_document_accessed'
      when 'restore' then 'patient_document_restored'
      else 'patient_document_deleted'
    end,
    'patient_document_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'patient_document', 'patient_document', v_document.id, v_document.id,
    jsonb_build_object(
      'document_id', v_document.id,
      'patient_id', v_document.patient_id,
      'operation', v_operation,
      'file_path', v_document.file_path,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_patient_document_lifecycle'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Patient document command committed';
  document := to_jsonb(v_document);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('document', document, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'patient-operational-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object(
      'command', 'command_patient_document_lifecycle',
      'operation', v_operation,
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'document_id', v_document.id,
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

drop function if exists public.command_medical_record_lifecycle(
  text, uuid, uuid, jsonb, text, text, uuid, text, text, text
);

create or replace function public.command_medical_record_lifecycle(
  p_operation text,
  p_record_id uuid default null,
  p_tenant_id uuid default null,
  p_payload jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_request_hash text default null,
  p_user_id uuid default null,
  p_request_trace_id text default null,
  p_operation_trace_id text default null,
  p_workflow_trace_id text default null
)
returns table (
  result_code text,
  retryable boolean,
  idempotency_replay boolean,
  message text,
  record jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_operation text := nullif(trim(coalesce(p_operation, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_record public.medical_records%rowtype;
  v_previous public.medical_records%rowtype;
  v_idempotency public.command_idempotency%rowtype;
  v_actor_id uuid := coalesce(p_user_id, auth.uid());
  v_event_type text;
  v_event_id uuid;
  v_started_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for medical record command' using errcode = '42501';
  end if;

  if v_operation not in ('create', 'amend', 'delete') then
    raise exception 'Unsupported medical record operation';
  end if;

  if p_idempotency_key is not null then
    insert into public.command_idempotency (
      tenant_id, operation_type, idempotency_key, request_hash, status, expires_at,
      request_trace_id, operation_trace_id, workflow_trace_id
    )
    values (
      p_tenant_id, 'medical_record_' || v_operation, p_idempotency_key, coalesce(p_request_hash, ''),
      'started', now() + interval '7 days', p_request_trace_id, p_operation_trace_id, p_workflow_trace_id
    )
    on conflict (tenant_id, operation_type, idempotency_key) do nothing;

    select *
    into v_idempotency
    from public.command_idempotency
    where tenant_id = p_tenant_id
      and operation_type = 'medical_record_' || v_operation
      and idempotency_key = p_idempotency_key
    for update;

    if v_idempotency.request_hash <> coalesce(p_request_hash, '') then
      raise exception 'Idempotency key reused with a different request hash' using errcode = '23505';
    end if;

    if v_idempotency.status = 'committed' and v_idempotency.response_payload is not null then
      result_code := 'OK';
      retryable := false;
      idempotency_replay := true;
      message := 'Medical record command replayed';
      record := v_idempotency.response_payload->'record';
      return next;
      return;
    end if;
  end if;

  if v_operation = 'create' then
    if not exists (
      select 1
      from public.patients p
      where p.id = (v_payload->>'patient_id')::uuid
        and p.tenant_id = p_tenant_id
        and p.deleted_at is null
    ) then
      raise exception 'Medical record patient does not belong to tenant' using errcode = '42501';
    end if;

    insert into public.medical_records (
      tenant_id, patient_id, doctor_id, record_date, diagnosis, notes, record_type
    )
    values (
      p_tenant_id,
      (v_payload->>'patient_id')::uuid,
      (v_payload->>'doctor_id')::uuid,
      coalesce(nullif(v_payload->>'record_date', '')::date, current_date),
      nullif(v_payload->>'diagnosis', ''),
      nullif(v_payload->>'notes', ''),
      coalesce(nullif(v_payload->>'record_type', ''), 'progress_note')
    )
    returning * into v_record;
    v_event_type := 'MedicalRecordCreated';

  else
    if p_record_id is null then
      raise exception 'Medical record id is required';
    end if;

    select *
    into v_record
    from public.medical_records
    where id = p_record_id
      and tenant_id = p_tenant_id
    for update;

    if not found then
      raise exception 'Medical record not found' using errcode = 'P0002';
    end if;

    v_previous := v_record;

    if v_operation = 'delete' then
      delete from public.medical_records
      where id = v_record.id
        and tenant_id = p_tenant_id;
      v_event_type := 'MedicalRecordArchived';
    else
      update public.medical_records
      set record_date = coalesce(nullif(v_payload->>'record_date', '')::date, record_date),
          diagnosis = case when v_payload ? 'diagnosis' then nullif(v_payload->>'diagnosis', '') else diagnosis end,
          notes = case when v_payload ? 'notes' then nullif(v_payload->>'notes', '') else notes end,
          record_type = coalesce(nullif(v_payload->>'record_type', ''), record_type)
      where id = v_record.id
        and tenant_id = p_tenant_id
      returning * into v_record;
      v_event_type := 'MedicalRecordAmended';
    end if;
  end if;

  v_event_id := public.create_domain_event(
    v_event_type,
    1,
    'medical_record',
    v_record.id,
    p_tenant_id,
    v_actor_id,
    jsonb_build_object(
      'recordId', v_record.id,
      'patientId', v_record.patient_id,
      'operation', v_operation,
      'previous', case when v_operation in ('amend', 'delete') then to_jsonb(v_previous) else null end,
      'current', case when v_operation = 'delete' then null else to_jsonb(v_record) end,
      'commandIdempotencyKey', p_idempotency_key
    ),
    p_request_trace_id,
    p_operation_trace_id,
    p_workflow_trace_id,
    null
  );

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    case v_operation
      when 'create' then 'medical_record_created'
      when 'delete' then 'medical_record_archived'
      else 'medical_record_amended'
    end,
    'medical_record_' || v_operation,
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'medical_record', 'medical_record', v_record.id, v_record.id,
    jsonb_build_object(
      'record_id', v_record.id,
      'patient_id', v_record.patient_id,
      'operation', v_operation,
      'previous', case when v_operation in ('amend', 'delete') then to_jsonb(v_previous) else null end,
      'current', case when v_operation = 'delete' then null else to_jsonb(v_record) end,
      'domain_event_id', v_event_id,
      'request_trace_id', p_request_trace_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    ),
    jsonb_build_object('domain_event_id', v_event_id, 'transactional_command', 'command_medical_record_lifecycle'),
    false
  );

  result_code := 'OK';
  retryable := false;
  idempotency_replay := false;
  message := 'Medical record command committed';
  record := to_jsonb(v_record);

  if p_idempotency_key is not null then
    update public.command_idempotency
    set status = 'committed',
      response_payload = jsonb_build_object('record', record, 'domain_event_id', v_event_id),
      request_trace_id = coalesce(request_trace_id, p_request_trace_id),
      operation_trace_id = coalesce(operation_trace_id, p_operation_trace_id),
      workflow_trace_id = coalesce(workflow_trace_id, p_workflow_trace_id),
      updated_at = now()
    where id = v_idempotency.id;
  end if;

  insert into public.system_logs (level, service, message, tenant_id, user_id, request_id, metadata)
  values (
    'info', 'patient-operational-command', 'transactional_command.duration',
    p_tenant_id, v_actor_id, p_request_trace_id,
    jsonb_build_object(
      'command', 'command_medical_record_lifecycle',
      'operation', v_operation,
      'duration_ms', greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000))::integer,
      'record_id', v_record.id,
      'domain_event_id', v_event_id,
      'operation_trace_id', p_operation_trace_id,
      'workflow_trace_id', p_workflow_trace_id
    )
  );

  return next;
end;
$function$;

drop function if exists public.run_patient_reconciliation(uuid, timestamptz, timestamptz, boolean, text, text, text);

create or replace function public.run_patient_reconciliation(
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
  v_policy public.patient_retention_policies%rowtype;
  v_actor_id uuid := auth.uid();
  v_findings jsonb := '[]'::jsonb;
  v_finding jsonb;
begin
  if p_tenant_id is null or p_tenant_id <> public.get_user_tenant_id(auth.uid()) then
    raise exception 'Tenant mismatch for patient reconciliation' using errcode = '42501';
  end if;

  select *
  into v_policy
  from public.patient_retention_policies
  where tenant_id = p_tenant_id;

  if not found then
    insert into public.patient_retention_policies (tenant_id)
    values (p_tenant_id)
    returning * into v_policy;
  end if;

  insert into public.patient_reconciliation_runs (
    id, tenant_id, window_start, window_end, request_trace_id, operation_trace_id, workflow_trace_id
  )
  values (v_run_id, p_tenant_id, p_window_start, p_window_end, p_request_trace_id, p_operation_trace_id, p_workflow_trace_id);

  insert into public.patient_reconciliation_findings (
    run_id, tenant_id, patient_id, related_entity_type, related_entity_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    p.id,
    'patient',
    p.id,
    'retention_expired_patient',
    'warning',
    jsonb_build_object(
      'deleted_at', p.deleted_at,
      'retention_class', case
        when p.id = any(v_policy.legal_hold_patient_ids) then 'legal_hold_patient'
        when p.deleted_at is null and p.status = 'active' then 'active_patient'
        when p.deleted_at is null then 'archived_patient'
        else 'soft_deleted_patient'
      end,
      'legal_hold', p.id = any(v_policy.legal_hold_patient_ids),
      'non_destructive', true
    )
  from public.patients p
  where p.tenant_id = p_tenant_id
    and p.deleted_at is not null
    and p.id <> all(v_policy.legal_hold_patient_ids)
    and p.deleted_at < now() - make_interval(years => v_policy.soft_deleted_retention_years);

  insert into public.patient_reconciliation_findings (
    run_id, tenant_id, patient_id, related_entity_type, related_entity_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    pd.patient_id,
    'patient_document',
    pd.id,
    'document_without_active_patient_scope',
    'critical',
    jsonb_build_object('document_id', pd.id, 'patient_id', pd.patient_id, 'document_deleted_at', pd.deleted_at)
  from public.patient_documents pd
  left join public.patients p on p.id = pd.patient_id and p.tenant_id = pd.tenant_id
  where pd.tenant_id = p_tenant_id
    and pd.deleted_at is null
    and (p.id is null or p.deleted_at is not null);

  insert into public.patient_reconciliation_findings (
    run_id, tenant_id, patient_id, related_entity_type, related_entity_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    mr.patient_id,
    'medical_record',
    mr.id,
    'medical_record_without_active_patient_scope',
    'critical',
    jsonb_build_object('record_id', mr.id, 'patient_id', mr.patient_id)
  from public.medical_records mr
  left join public.patients p on p.id = mr.patient_id and p.tenant_id = mr.tenant_id
  where mr.tenant_id = p_tenant_id
    and (p.id is null or p.deleted_at is not null);

  insert into public.patient_reconciliation_findings (
    run_id, tenant_id, patient_id, related_entity_type, related_entity_id, finding_code, severity, evidence
  )
  select
    v_run_id,
    p_tenant_id,
    p.id,
    'patient',
    p.id,
    'legal_hold_patient_retained',
    'info',
    jsonb_build_object('legal_hold', true, 'non_destructive', true)
  from public.patients p
  where p.tenant_id = p_tenant_id
    and p.id = any(v_policy.legal_hold_patient_ids);

  select
    count(*)::integer,
    count(*) filter (where severity = 'critical')::integer,
    count(*) filter (where severity = 'warning')::integer
  into finding_count, critical_count, warning_count
  from public.patient_reconciliation_findings
  where patient_reconciliation_findings.run_id = v_run_id;

  update public.patient_reconciliation_runs
  set finding_count = run_patient_reconciliation.finding_count,
      critical_count = run_patient_reconciliation.critical_count,
      warning_count = run_patient_reconciliation.warning_count
  where id = v_run_id;

  insert into public.audit_logs (
    tenant_id, user_id, actor_id, action, action_type, request_id,
    entity_type, resource_type, entity_id, resource_id, details, metadata, is_global
  )
  values (
    p_tenant_id, v_actor_id, v_actor_id,
    'patient_reconciliation_run',
    'patient_reconciliation',
    case when p_request_trace_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request_trace_id::uuid else null end,
    'patient_reconciliation_run', 'patient_reconciliation_run', v_run_id, v_run_id,
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
    jsonb_build_object('transactional_command', 'run_patient_reconciliation'),
    false
  );

  run_id := v_run_id;
  return next;
end;
$function$;

revoke all on function public.command_patient_lifecycle(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) from anon;
revoke all on function public.command_patient_document_lifecycle(text, uuid, uuid, jsonb, text, text, uuid, text, text, text) from anon;
revoke all on function public.command_medical_record_lifecycle(text, uuid, uuid, jsonb, text, text, uuid, text, text, text) from anon;
revoke all on function public.run_patient_reconciliation(uuid, timestamptz, timestamptz, boolean, text, text, text) from anon;

grant execute on function public.command_patient_lifecycle(text, uuid, uuid, jsonb, timestamptz, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.command_patient_document_lifecycle(text, uuid, uuid, jsonb, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.command_medical_record_lifecycle(text, uuid, uuid, jsonb, text, text, uuid, text, text, text) to authenticated;
grant execute on function public.run_patient_reconciliation(uuid, timestamptz, timestamptz, boolean, text, text, text) to authenticated;
