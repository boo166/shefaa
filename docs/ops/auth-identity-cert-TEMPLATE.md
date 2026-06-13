# Auth Identity Certification — Template

Date: `YYYY-MM-DD`  
Environment: `local | staging | production`  
Verifier: `name`

## Phase A — Identity Audit Trail

| Event | Verified in audit_logs | Notes |
|-------|------------------------|-------|
| LOGIN_SUCCESS | [ ] | |
| LOGIN_FAILED | [ ] | Generic details (email_domain only) |
| LOGOUT | [ ] | |
| PASSWORD_RESET_REQUESTED | [ ] | |
| PASSWORD_RESET_COMPLETED | [ ] | |
| MFA_ENROLLED | [ ] | |
| MFA_REMOVED | [ ] | |
| MFA_CHALLENGE_FAILED | [ ] | |
| RECOVERY_CODE_USED | [ ] | Server RPC |
| INVITE_ACCEPTED | [ ] | handle_new_user trigger |
| ROLE_CHANGED | [ ] | user_roles trigger |
| USER_SUSPENDED | [ ] | |
| USER_REACTIVATED | [ ] | |

Sample query:

```sql
SELECT action, actor_id, user_id, tenant_id, created_at, details
FROM audit_logs
WHERE action IN ('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT')
ORDER BY created_at DESC
LIMIT 20;
```

## Phase A — Baseline smoke (before capability enforce)

| Surface | PASS | Notes |
|---------|------|-------|
| Billing reconciliation | [ ] | |
| Pharmacy workflows | [ ] | |
| Lab amendment flows | [ ] | |
| Runtime ops `/admin/ops/runtime` | [ ] | |
| Clinic ops `/tenant/:slug/ops` | [ ] | |

## Phase A — Capability enforcement

`VITE_RUNTIME_CAPABILITY_ENFORCE=true` in staging: [ ]  
Production enabled after clean staging: [ ]

## Phase B — Enforcement

| Control | PASS | Notes |
|---------|------|-------|
| MFA required (6 roles) | [ ] | |
| Recovery Option B (AAL1 login, TOTP for privileged) | [ ] | |
| User suspension | [ ] | |
| Tenant slug redirect | [ ] | |
| Password min 12 | [ ] | |
| `/ops` route guard | [ ] | |

## Automated checks

```bash
npm test -- src/services/auth/__tests__/identityAudit.service.test.ts src/core/auth/__tests__/mfaCompliance.test.ts
npm test -- src/platform/authorization/__tests__/rbacMatrix.test.ts
```

## Verdict

- [ ] PASS — Identity Production Certified
- [ ] PARTIAL — list gaps
- [ ] FAIL — blockers remain
