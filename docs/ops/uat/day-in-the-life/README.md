# Day In The Life — User Acceptance Testing

Manual UAT on **staging only**. Each role must complete a full clinic day without developer intervention.

## Preconditions

- Staging has production-like data (run `npm run load-cert:seed` first for volume tests).
- Dedicated test accounts exist per role (see [RBAC Certification Matrix](../rbac-certification-matrix.md)).
- `VITE_RUNTIME_POLICY_ENFORCE=1` enabled on staging.
- Tester records pass/fail and screenshots for any blocker.

## Role Checklists

| Role | Checklist | Staging account |
|------|-----------|-----------------|
| Receptionist | [receptionist.md](./receptionist.md) | `receptionist@<staging-domain>` |
| Doctor | [doctor.md](./doctor.md) | `doctor@<staging-domain>` |
| Accountant | [accountant.md](./accountant.md) | `accountant@<staging-domain>` |
| Pharmacist | [pharmacist.md](./pharmacist.md) | `pharmacist@<staging-domain>` |
| Lab Technician | [lab-technician.md](./lab-technician.md) | `labtech@<staging-domain>` |

Replace `<staging-domain>` with your staging tenant email domain.

## Sign-Off Template

| Role | Tester | Date | Result | Blockers |
|------|--------|------|--------|----------|
| Receptionist | | | PASS / FAIL | |
| Doctor | | | PASS / FAIL | |
| Accountant | | | PASS / FAIL | |
| Pharmacist | | | PASS / FAIL | |
| Lab Technician | | | PASS / FAIL | |

**UAT gate:** all five roles PASS with zero critical blockers.

## Evidence To Capture

- Screenshot of each completed workflow step.
- Browser console: no unexpected 401/403/500 on happy paths.
- Runtime Ops snapshot after accountant + pharmacist flows (reconciliation critical = 0).

## Related

- [staging-load-cert-runbook.md](../staging-load-cert-runbook.md)
- [billing-lifecycle-smoke-test.md](../billing-lifecycle-smoke-test.md)
- [backup-restore-validation-checklist.md](../backup-restore-validation-checklist.md)
