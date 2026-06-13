# Disaster Recovery Drill Results

Date: YYYY-MM-DD  
Operator:  
Reviewer:  
Target environment: staging-restore / ephemeral

## Summary

| Stage | Result |
|-------|--------|
| Backup artifact validation | PASS / FAIL |
| Database restore | PASS / FAIL |
| `backup-smoke.sql` | PASS / FAIL |
| Reconciliation dry run | PASS / FAIL |
| Application smoke | PASS / FAIL |
| Tenant isolation manual check | PASS / FAIL |
| **Overall DR gate** | PASS / FAIL |

## Drill Timeline

| Step | Start (UTC) | End (UTC) | Duration | Result |
|------|-------------|-----------|----------|--------|
| Backup identified | | | | |
| Restore started | | | | |
| Restore completed | | | | |
| Smoke SQL | | | | |
| App validation | | | | |

## Backup Source

- Source environment:
- Backup timestamp (RPO):
- Backup artifact ID / file:
- Restore target:

## Stage 1 — Backup Artifact

- [ ] Backup completed successfully
- [ ] Artifact readable by `pg_restore` / `psql`
- [ ] Expected schema objects present post-restore

## Stage 2 — Database Restore

```bash
psql -v ON_ERROR_STOP=1 -f scripts/backup-smoke.sql
```

- [ ] Restore completed without SQL errors
- [ ] Core tables present
- [ ] `tenant_id` on expected tables
- [ ] RLS enabled on operational tables
- [ ] Tenant isolation policies present
- [ ] Soft-delete restrictive policies present

## Stage 3 — Reconciliation

```sql
-- Billing
SELECT * FROM run_billing_reconciliation(
  _tenant_id := '<tenant-a-uuid>',
  _window_start := now() - interval '7 days',
  _window_end := now(),
  _dry_run := true
);

-- Notifications
SELECT * FROM run_notification_reconciliation(
  p_tenant_id := '<tenant-a-uuid>',
  p_window_start := (now() - interval '7 days')::timestamptz,
  p_window_end := now(),
  p_dry_run := true
);
```

| Domain | Critical | Warning |
|--------|---------:|--------:|
| Billing | | |
| Notifications | | |
| Appointments | | |

## Stage 4 — Application Smoke

- [ ] Clinic admin login (Tenant A)
- [ ] Dashboard loads
- [ ] Patients list loads
- [ ] Patient detail opens
- [ ] Appointments page loads
- [ ] Create test patient (non-destructive)
- [ ] Tenant B user sees only Tenant B data
- [ ] Tenant A cannot access Tenant B patient by URL

## Stage 5 — Security

- [ ] No production secrets in drill logs
- [ ] Document storage requires authorized access
- [ ] Audit log entry created for test mutation

## Failure Classification (if applicable)

- [ ] Backup artifact failure
- [ ] Restore procedure failure
- [ ] Schema mismatch
- [ ] RLS / tenant isolation failure
- [ ] App smoke failure

## Remediation

| Issue | Owner | ETA |
|-------|-------|-----|
| | | |

## Sign-Off

- [ ] Engineering sign-off
- [ ] Operations sign-off
- [ ] Ready to proceed to Phase 4 (UAT)

Related: [backup-restore-validation-checklist.md](./backup-restore-validation-checklist.md)
