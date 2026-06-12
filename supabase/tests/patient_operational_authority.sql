begin;

select plan(28);

set local role postgres;
set local session_replication_role = replica;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);

truncate
  public.patient_reconciliation_findings,
  public.patient_reconciliation_runs,
  public.patient_retention_policies,
  public.dead_letter_events,
  public.event_delivery_attempts,
  public.event_outbox,
  public.domain_events,
  public.system_logs,
  public.command_idempotency,
  public.audit_logs,
  public.patient_documents,
  public.medical_records,
  public.appointments,
  public.doctors,
  public.patients,
  public.user_roles,
  public.profiles,
  public.tenants
restart identity cascade;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '71000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'patient-command@test.com',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

insert into public.tenants (id, name, slug, status, status_changed_at)
values
  ('70000000-0000-0000-0000-000000000001', 'Patient Command Tenant', 'patient-command-tenant', 'active', now()),
  ('70000000-0000-0000-0000-000000000002', 'Foreign Patient Tenant', 'foreign-patient-tenant', 'active', now());

insert into public.subscriptions (tenant_id, plan, status, amount, currency, billing_cycle, started_at)
values (
  '70000000-0000-0000-0000-000000000001',
  'pro',
  'active',
  200,
  'EGP',
  'monthly',
  now()
)
on conflict (tenant_id) do update
set
  plan = excluded.plan,
  status = excluded.status,
  amount = excluded.amount,
  currency = excluded.currency,
  billing_cycle = excluded.billing_cycle,
  started_at = excluded.started_at,
  expires_at = null;

insert into public.feature_flags (tenant_id, feature_key, enabled)
values ('70000000-0000-0000-0000-000000000001', 'advanced_reports', true)
on conflict (tenant_id, feature_key) do update
set enabled = excluded.enabled;

insert into public.profiles (id, user_id, tenant_id, full_name)
values ('72000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'Patient Command User');

insert into public.user_roles (id, user_id, role)
values ('73000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'clinic_admin');

insert into public.doctors (id, tenant_id, user_id, full_name, specialty, status)
values ('75000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '71000000-0000-0000-0000-000000000001', 'Patient Command Doctor', 'Family Medicine', 'available');

set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"71000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is(
  (select result_code from public.command_patient_lifecycle(
    'create',
    null,
    '70000000-0000-0000-0000-000000000001',
    '{"full_name":"Command Patient","date_of_birth":"1985-02-03","status":"active"}'::jsonb,
    null,
    'patient-create-key-1',
    'patient-create-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-patient-1',
    'op-patient-1',
    'wf-patient-1'
  )),
  'OK',
  'patient create command commits successfully'
);

set local role postgres;

select is((select count(*) from public.patients where full_name = 'Command Patient'), 1::bigint, 'patient create writes patient row');
select id as command_patient_id from public.patients where full_name = 'Command Patient' \gset
select is((select count(*) from public.domain_events where event_type = 'PatientRegistered'), 1::bigint, 'patient create writes domain event');
select ok((select count(*) from public.event_outbox where event_type = 'PatientRegistered') > 0, 'patient create enqueues durable outbox rows');
select ok(exists (select 1 from public.audit_logs where action_type = 'patient_create' and details->>'workflow_trace_id' = 'wf-patient-1'), 'patient create audit includes trace evidence');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

select is(
  (select idempotency_replay from public.command_patient_lifecycle(
    'create',
    null,
    '70000000-0000-0000-0000-000000000001',
    '{"full_name":"Command Patient","date_of_birth":"1985-02-03","status":"active"}'::jsonb,
    null,
    'patient-create-key-1',
    'patient-create-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-patient-1',
    'op-patient-1',
    'wf-patient-1'
  )),
  true,
  'patient create idempotency replays without duplicate mutation'
);

select is((select count(*) from public.patients where full_name = 'Command Patient'), 1::bigint, 'patient replay does not duplicate patient row');

select is(
  (select result_code from public.command_patient_lifecycle(
    'update',
    :'command_patient_id'::uuid,
    '70000000-0000-0000-0000-000000000001',
    '{"status":"inactive"}'::jsonb,
    null,
    'patient-update-key-1',
    'patient-update-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-patient-2',
    'op-patient-2',
    'wf-patient-2'
  )),
  'OK',
  'patient update command commits successfully'
);

select is((select status from public.patients where full_name = 'Command Patient'), 'inactive', 'patient update changes status');

select throws_ok(
  format($$
    select * from public.command_patient_lifecycle(
      'restore',
      %L::uuid,
      '70000000-0000-0000-0000-000000000002',
      '{}'::jsonb,
      null,
      'foreign-patient-key',
      'foreign-patient-hash',
      '71000000-0000-0000-0000-000000000001',
      'req-foreign',
      'op-foreign',
      'wf-foreign'
    );
  $$, :'command_patient_id'),
  '42501',
  'Tenant mismatch for patient lifecycle command',
  'patient command rejects explicit cross-tenant scope'
);

insert into public.appointments (
  id, tenant_id, patient_id, doctor_id, appointment_date, status, type
)
values (
  '76000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  :'command_patient_id'::uuid,
  '75000000-0000-0000-0000-000000000001',
  now() + interval '1 day',
  'scheduled',
  'checkup'
);

select throws_ok(
  format($$
    select * from public.command_patient_lifecycle(
      'archive',
      %L::uuid,
      '70000000-0000-0000-0000-000000000001',
      '{}'::jsonb,
      null,
      'patient-archive-blocked-key',
      'patient-archive-blocked-hash',
      '71000000-0000-0000-0000-000000000001',
      'req-patient-archive-blocked',
      'op-patient-archive-blocked',
      'wf-patient-archive-blocked'
    );
  $$, :'command_patient_id'),
  null,
  'Cannot archive or deactivate patient with active appointments',
  'patient archive is blocked by active appointment'
);

update public.appointments set status = 'completed' where id = '76000000-0000-0000-0000-000000000001';

select is(
  (select result_code from public.command_patient_lifecycle(
    'archive',
    :'command_patient_id'::uuid,
    '70000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'patient-archive-key-1',
    'patient-archive-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-patient-archive',
    'op-patient-archive',
    'wf-patient-archive'
  )),
  'OK',
  'patient archive command commits after appointment closes'
);

set local role postgres;

select isnt((select deleted_at from public.patients where id = :'command_patient_id'::uuid), null, 'patient archive soft-deletes patient');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

select is(
  (select result_code from public.command_patient_lifecycle(
    'restore',
    :'command_patient_id'::uuid,
    '70000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    'patient-restore-key-1',
    'patient-restore-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-patient-restore',
    'op-patient-restore',
    'wf-patient-restore'
  )),
  'OK',
  'patient restore command commits successfully'
);

set local role postgres;

select is((select deleted_at from public.patients where id = :'command_patient_id'::uuid), null, 'patient restore clears soft-delete');

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

select is(
  (select result_code from public.command_patient_document_lifecycle(
    'create',
    null,
    '70000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'patient_id', :'command_patient_id'::uuid,
      'file_name', 'doc.pdf',
      'file_path', '70000000-0000-0000-0000-000000000001/patients/command/doc.pdf',
      'file_size', 12,
      'file_type', 'application/pdf',
      'uploaded_by', '71000000-0000-0000-0000-000000000001'
    ),
    'patient-document-create-key-1',
    'patient-document-create-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-doc-1',
    'op-doc-1',
    'wf-doc-1'
  )),
  'OK',
  'patient document create command commits successfully'
);

select ok(exists (select 1 from public.audit_logs where action_type = 'patient_document_create' and details->>'workflow_trace_id' = 'wf-doc-1'), 'document upload audit evidence includes trace ids');

select is(
  (select result_code from public.command_patient_document_lifecycle(
    'access',
    (select id from public.patient_documents where file_name = 'doc.pdf'),
    '70000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    null,
    null,
    '71000000-0000-0000-0000-000000000001',
    'req-doc-access',
    'op-doc-access',
    'wf-doc-access'
  )),
  'OK',
  'patient document access command commits evidence successfully'
);

select ok(exists (select 1 from public.audit_logs where action_type = 'patient_document_access' and details->>'workflow_trace_id' = 'wf-doc-access'), 'document access audit evidence includes trace ids');

select is(
  (select result_code from public.command_medical_record_lifecycle(
    'create',
    null,
    '70000000-0000-0000-0000-000000000001',
    jsonb_build_object(
      'patient_id', :'command_patient_id'::uuid,
      'doctor_id', '75000000-0000-0000-0000-000000000001',
      'record_type', 'progress_note',
      'diagnosis', 'Initial',
      'notes', 'Created'
    ),
    'medical-record-create-key-1',
    'medical-record-create-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-record-1',
    'op-record-1',
    'wf-record-1'
  )),
  'OK',
  'medical record create command commits successfully'
);

select is(
  (select result_code from public.command_medical_record_lifecycle(
    'amend',
    (select id from public.medical_records where diagnosis = 'Initial'),
    '70000000-0000-0000-0000-000000000001',
    '{"diagnosis":"Amended","notes":"Updated"}'::jsonb,
    'medical-record-amend-key-1',
    'medical-record-amend-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-record-amend',
    'op-record-amend',
    'wf-record-amend'
  )),
  'OK',
  'medical record amend command commits successfully'
);

select ok(
  exists (
    select 1 from public.audit_logs
    where action_type = 'medical_record_amend'
      and details ? 'previous'
      and details ? 'current'
      and details->>'workflow_trace_id' = 'wf-record-amend'
  ),
  'medical record amendment audit stores immutable previous/current evidence'
);

select is(
  (select result_code from public.command_medical_record_lifecycle(
    'delete',
    (select id from public.medical_records where diagnosis = 'Amended'),
    '70000000-0000-0000-0000-000000000001',
    '{}'::jsonb,
    'medical-record-delete-key-1',
    'medical-record-delete-hash-1',
    '71000000-0000-0000-0000-000000000001',
    'req-record-delete',
    'op-record-delete',
    'wf-record-delete'
  )),
  'OK',
  'medical record delete command commits audit evidence successfully'
);

insert into public.patient_retention_policies (
  tenant_id,
  soft_deleted_retention_years,
  legal_hold_patient_ids
)
values (
  '70000000-0000-0000-0000-000000000001',
  1,
  array[:'command_patient_id'::uuid]
)
on conflict (tenant_id) do update
set soft_deleted_retention_years = excluded.soft_deleted_retention_years,
    legal_hold_patient_ids = excluded.legal_hold_patient_ids;

insert into public.patients (id, tenant_id, patient_code, full_name, status, deleted_at)
values (
  '74000000-0000-0000-0000-000000000099',
  '70000000-0000-0000-0000-000000000001',
  'PT-EXPIRED',
  'Expired Retention Patient',
  'inactive',
  now() - interval '2 years'
);

select is(
  (select finding_count from public.run_patient_reconciliation(
    '70000000-0000-0000-0000-000000000001',
    now() - interval '30 days',
    now(),
    false,
    'req-patient-reconcile',
    'op-patient-reconcile',
    'wf-patient-reconcile'
  )),
  2,
  'patient reconciliation records retention and legal-hold findings'
);

select ok(exists (select 1 from public.patient_reconciliation_findings where finding_code = 'retention_expired_patient'), 'reconciliation detects retention-expired patient');
select ok(exists (select 1 from public.patient_reconciliation_findings where finding_code = 'legal_hold_patient_retained'), 'reconciliation preserves legal-hold patient as non-destructive finding');

select is((select count(*) from public.search_global('Expired Retention Patient', 10)), 0::bigint, 'global search excludes soft-deleted patients');
select is((select total_patients from public.get_report_overview('70000000-0000-0000-0000-000000000001')), 1::bigint, 'report overview excludes soft-deleted patients');

select * from finish();
rollback;
