begin;

select plan(14);

-- Use a superuser role for validation to access catalog tables
set local role postgres;

-- 1. Policy coverage: every public table has at least one RLS policy
select is(
  (
    select count(*) from (
      select tablename
      from pg_tables
      where schemaname = 'public'
        and tablename not in ('schema_migrations')
    except
      select tablename from pg_policies where schemaname = 'public'
    ) t
  ),
  0::bigint,
  'All public tables have at least one RLS policy'
);

-- 2. Tenant_id column presence on required tables
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'tenant_id'
      and table_name in (
        'patients', 'appointments', 'lab_orders', 'prescriptions',
        'invoices', 'patient_documents', 'notifications', 'insurance_claims',
        'appointment_queue', 'reminder_queue', 'appointment_reminder_log',
        'patient_accounts', 'appointment_reminder_config', 'patient_contact_preferences',
        'domain_events', 'event_outbox', 'event_delivery_attempts', 'dead_letter_events',
        'jobs', 'system_logs', 'video_sessions',
        'suppliers', 'purchase_orders', 'purchase_order_items', 'stock_receipts',
        'medication_batches', 'inventory_movements',
        'lab_test_mappings', 'external_lab_connections', 'external_lab_events',
        'integration_api_keys'
      )
  ),
  31::bigint,
  'Required tables include tenant_id'
);

-- 3. Tenant isolation policies include get_user_tenant_id for core tables
select is(
  (
    select count(distinct tablename)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'patients', 'appointments', 'lab_orders', 'prescriptions',
        'invoices', 'patient_documents', 'notifications', 'insurance_claims'
      )
      and (
        coalesce(qual, '') ilike '%get_user_tenant_id%'
        or coalesce(with_check, '') ilike '%get_user_tenant_id%'
      )
  ),
  8::bigint,
  'Core tenant tables enforce tenant isolation in RLS'
);

-- 4. Foreign key integrity: patients -> related tables
select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_class ft on c.confrelid = ft.oid
    where t.relname = 'appointments'
      and ft.relname = 'patients'
      and c.contype = 'f'
  ),
  'appointments.patient_id references patients'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_class ft on c.confrelid = ft.oid
    where t.relname = 'prescriptions'
      and ft.relname = 'patients'
      and c.contype = 'f'
  ),
  'prescriptions.patient_id references patients'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_class ft on c.confrelid = ft.oid
    where t.relname = 'lab_orders'
      and ft.relname = 'patients'
      and c.contype = 'f'
  ),
  'lab_orders.patient_id references patients'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_class ft on c.confrelid = ft.oid
    where t.relname = 'invoices'
      and ft.relname = 'patients'
      and c.contype = 'f'
  ),
  'invoices.patient_id references patients'
);

select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_class ft on c.confrelid = ft.oid
    where t.relname = 'patient_documents'
      and ft.relname = 'patients'
      and c.contype = 'f'
  ),
  'patient_documents.patient_id references patients'
);

-- 5. Index checks for critical queries
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'patients' and indexdef ilike '%(tenant_id)%'),
  'patients has tenant_id index'
);

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'appointments' and indexdef ilike '%(tenant_id%appointment_date%')
   or exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'appointments' and indexdef ilike '%(tenant_id, appointment_date%'),
  'appointments has tenant_id + appointment_date index'
);

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'appointments' and indexdef ilike '%(patient_id)%'),
  'appointments has patient_id index'
);

select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'appointments' and indexdef ilike '%(doctor_id%appointment_date%')
   or exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'appointments' and indexdef ilike '%(doctor_id, appointment_date%'),
  'appointments has doctor_id + appointment_date index'
);

-- 6. Soft delete restrictive policies
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'public'
      and policyname = 'Exclude deleted records'
      and tablename in (
        'patients', 'appointments', 'lab_orders', 'prescriptions',
        'invoices', 'insurance_claims', 'patient_documents'
      )
  ),
  7::bigint,
  'Soft delete restrictive policies exist for core tables'
);

-- 7. Appointment overlap exclusion constraint
select ok(
  exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'appointments'
      and c.conname = 'appointments_no_overlap'
      and c.contype = 'x'
  ),
  'appointments_no_overlap exclusion constraint exists'
);

select * from finish();
rollback;
