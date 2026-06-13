-- RLS coverage report for operational readiness audits.
-- Run against staging or restored target:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/rls-coverage-report.sql

\echo '=== RLS Coverage Summary ==='

SELECT
  'tables_without_policies' AS check_name,
  count(*)::bigint AS gap_count
FROM (
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('schema_migrations')
  EXCEPT
  SELECT tablename
  FROM pg_policies
  WHERE schemaname = 'public'
) missing;

SELECT
  'rls_disabled_tables' AS check_name,
  count(*)::bigint AS gap_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT IN ('schema_migrations')
  AND NOT c.relrowsecurity;

\echo '=== Tables Missing Any Policy ==='

SELECT tablename
FROM (
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('schema_migrations')
  EXCEPT
  SELECT tablename
  FROM pg_policies
  WHERE schemaname = 'public'
) t
ORDER BY tablename;

\echo '=== Sensitive Tables Missing Tenant Isolation ==='

WITH sensitive AS (
  SELECT unnest(ARRAY[
    'patients', 'appointments', 'appointment_queue', 'medical_records',
    'prescriptions', 'lab_orders', 'invoices', 'invoice_payments',
    'patient_documents', 'notifications', 'insurance_claims',
    'medications', 'medication_batches', 'inventory_movements',
    'domain_events', 'event_outbox', 'audit_logs', 'jobs', 'system_logs',
    'client_error_logs', 'billing_reconciliation_findings',
    'billing_reconciliation_runs', 'notification_reconciliation_findings',
    'appointment_reconciliation_findings', 'patient_reconciliation_findings'
  ]) AS tablename
),
tenant_isolated AS (
  SELECT DISTINCT tablename
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      coalesce(qual, '') ILIKE '%get_user_tenant_id%'
      OR coalesce(with_check, '') ILIKE '%get_user_tenant_id%'
      OR coalesce(qual, '') ILIKE '%auth.uid()%'
      OR coalesce(with_check, '') ILIKE '%auth.uid()%'
    )
)
SELECT s.tablename
FROM sensitive s
LEFT JOIN tenant_isolated t ON t.tablename = s.tablename
WHERE t.tablename IS NULL
  AND to_regclass(format('public.%I', s.tablename)) IS NOT NULL
ORDER BY s.tablename;

\echo '=== Policy Count By Table ==='

SELECT
  tablename,
  count(*) AS policy_count,
  string_agg(DISTINCT cmd, ', ' ORDER BY cmd) AS commands
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

\echo '=== Full Policy Listing ==='

SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
