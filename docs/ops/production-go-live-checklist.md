# Production Go-Live Checklist

Use before onboarding the **first real clinic**. All items require sign-off.

Date: ____________  
Operator: ____________  
Reviewer: ____________

## Gate 5 — Production Readiness

### Monitoring

| Item | Verified | Notes |
|------|----------|-------|
| Runtime Ops dashboard (`/admin/ops/runtime`) loads | [ ] | |
| Billing reconciliation panel operational | [ ] | |
| Notification reconciliation panel operational | [ ] | |
| Appointment reconciliation panel operational | [ ] | |
| Dead letter alert threshold configured | [ ] | |
| Auth SLO dashboards (refresh, recovery, drift) | [ ] | |

### Backup & DR

| Item | Verified | Notes |
|------|----------|-------|
| Daily automated backups enabled (Supabase) | [ ] | |
| Backup verification workflow green | [ ] | |
| Restore runbook reviewed | [ ] | [backup-restore-validation-checklist.md](./backup-restore-validation-checklist.md) |
| RPO recorded | [ ] | Target: 15 min |
| RTO recorded | [ ] | Target: 4 hours |
| DR drill passed on staging | [ ] | |

### Security

| Item | Verified | Notes |
|------|----------|-------|
| MFA enforced for privileged roles | [ ] | [MFA_SECURITY_MODEL.md](../MFA_SECURITY_MODEL.md) |
| RBAC matrix certified | [ ] | [rbac-certification-matrix.md](./rbac-certification-matrix.md) |
| RLS coverage report zero gaps | [ ] | `scripts/ops/rls-coverage-report.sql` |
| npm audit triage closed (no reachable critical/high) | [ ] | |
| Service role not in client bundle | [ ] | `npm run ops:security-audit` |
| CSP report-only clean on staging | [ ] | |

### Operations

| Item | Verified | Notes |
|------|----------|-------|
| Incident playbooks accessible | [ ] | [playbooks/](./playbooks/) |
| On-call contact defined | [ ] | |
| Escalation path documented | [ ] | |
| Rollback procedure tested | [ ] | [production-rollout-checklist.md](../operations/production-rollout-checklist.md) |
| Kill switch verified | [ ] | |

### Load & Performance

| Item | Verified | Notes |
|------|----------|-------|
| Load game-day PASS on staging | [ ] | |
| 100k patients / 100k invoices / 1M notifications verified | [ ] | |
| p95 within SLO gates | [ ] | |
| Reconciliation critical = 0 post-load | [ ] | |

### UAT

| Role | Result | Tester | Date |
|------|--------|--------|------|
| Receptionist | [ ] PASS / NOTES / FAIL | | |
| Doctor | [ ] PASS / NOTES / FAIL | | |
| Accountant | [ ] PASS / NOTES / FAIL | | |
| Pharmacist | [ ] PASS / NOTES / FAIL | | |
| Lab Technician | [ ] PASS / NOTES / FAIL | | |

## Final Sign-Off

- [ ] Engineering Lead
- [ ] Operations Lead
- [ ] Security Review
- [ ] Product / Clinic Owner

**Go-Live approved:** YES / NO
