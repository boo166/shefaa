# Staging Load Certification Runbook

Production-like volume validation. Works against **local Supabase (Docker)** or remote staging.

## Local Supabase (Docker) — default

When `supabase start` is running, load-cert scripts auto-detect local credentials via `supabase status -o json`. Sync the Vite client env first:

```bash
supabase start
npm run supabase:sync-env
npm run supabase:sync-env -- --force   # overwrite existing .env.local
```

`.env.local` contains only **local** URLs (`127.0.0.1` / `localhost`). Remote URLs are rejected.

```bash
npm run load-cert:bootstrap
npm run load-cert:seed
npm run load-cert:verify-seed
npm run load-cert:game-day
```

Force local or remote:

```bash
# Local Docker (default when running)
set SUPABASE_TARGET=local
npm run load-cert:game-day

# Remote staging project
set SUPABASE_TARGET=remote
set SUPABASE_SERVICE_ROLE_KEY=<key>
npm run load-cert:game-day
```

Local endpoints (from `supabase status`):

| Service | URL |
|---------|-----|
| API | `http://127.0.0.1:54321` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio | `http://127.0.0.1:54323` |

Ensure fixtures exist on local (tenant, doctor, medication):

```bash
npm run load-cert:bootstrap
```

### Notification load paths

| Script | Path | Use |
|--------|------|-----|
| `load-cert:notifications-outbox` | outbox → worker/pipeline → notification | **Production path** (game-day default) |
| `load-cert:notifications` | direct `command_notification_delivery` RPC | Authority stress only |

Set `EVENT_DELIVERY_WORKER_SECRET` to invoke the real edge worker; otherwise the outbox script falls back to claim/deliver/mark RPC pipeline.

## Remote Staging

## Entry Criteria

- Staging Supabase project with all pending migrations applied.
- Service role credentials available (never use in browser/client).
- At least one active tenant with doctor, medication batch, and staff profile.
- `npm run test:db` green locally.

## Environment

```bash
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
export TENANT_ID="<staging-tenant-uuid>"   # optional; auto-resolved if omitted
```

## Phase 1A — Seed Volume Data

Default targets: **100k patients**, **100k invoices**, **1M notifications**.

```bash
# Full seed (idempotent — skips rows already present)
npm run load-cert:seed

# Partial seed
SEED_ONLY=patients npm run load-cert:seed
SEED_ONLY=invoices npm run load-cert:seed
SEED_ONLY=notifications npm run load-cert:seed

# Custom volumes
PATIENT_COUNT=100000 INVOICE_COUNT=100000 NOTIFICATION_COUNT=1000000 npm run load-cert:seed
```

Capture:
- Seed duration (stdout).
- Final row counts printed at end.

## Phase 1B — Run Load-Cert Scripts

Capture Runtime Ops snapshot **before and after** each script.

```bash
# Billing: 100k payments, p95 ≤ 500ms
PAYMENT_COUNT=100000 BILLING_P95_MS=500 npm run load-cert:billing

# Notifications: 1M deliveries (adjust timeout for scale)
DELIVERY_COUNT=1000000 NOTIF_MAX_MS=3600000 npm run load-cert:notifications

# Appointments: concurrent slot contention
BOOKING_ATTEMPTS=5000 npm run load-cert:appointments

# Inventory: reservation + dispense
DEDUCTION_COUNT=500 npm run load-cert:inventory

# 50 concurrent users × 20 ops
CONCURRENT_USERS=50 OPS_PER_USER=20 npm run load-cert:concurrent
```

Or run all:

```bash
npm run load-cert:game-day
```

## Phase 1C — Database Diagnostics

After load runs, capture slow queries and index health:

```sql
-- Top slow queries (requires pg_stat_statements)
SELECT calls, mean_exec_time, query
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;

-- Outbox backlog
SELECT status, count(*) FROM event_outbox GROUP BY status;

-- Dead letters
SELECT count(*) FROM dead_letter_events WHERE created_at > now() - interval '24 hours';
```

## Pass Gates

| Script | Gate |
|--------|------|
| `seed-staging-volume.mjs` | patients ≥ 100k, invoices ≥ 100k, notifications ≥ 1M |
| `billing-payments.mjs` | p95 ≤ 500ms, zero duplicate payments, reconciliation critical = 0 |
| `notification-deliveries.mjs` | reconciliation critical = 0, drain within NOTIF_MAX_MS |
| `appointment-bookings.mjs` | exactly 1 winner, zero overlap violations |
| `inventory-deductions.mjs` | stock never negative |
| `concurrent-users.mjs` | p95 ≤ 2000ms, error rate ≤ 1% |

## Results Recording

Copy [staging-load-cert-results-TEMPLATE.md](./staging-load-cert-results-TEMPLATE.md) to:

`docs/ops/staging-load-cert-results-YYYY-MM-DD.md`

## Failure Response

1. Capture failing script output and Runtime Ops snapshot.
2. Run `EXPLAIN ANALYZE` on top slow queries.
3. Add or fix indexes via migration.
4. Re-run failed script only.
5. Do not proceed to security/DR/UAT gates until load gate passes.

## Related

- [production-rollout-checklist.md](../operations/production-rollout-checklist.md)
- [tests/chaos/drill-runbook.md](../../tests/chaos/drill-runbook.md)
