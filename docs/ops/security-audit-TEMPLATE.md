# Security Audit Results

Date: YYYY-MM-DD  
Operator:

## Summary

| Gate | Result |
|------|--------|
| Dependency audit (`npm audit`) | PASS / FAIL |
| Secret exposure scan | PASS / FAIL |
| Edge function service role allowlist | PASS / FAIL |
| RLS coverage report | PASS / FAIL |
| **Overall security gate** | PASS / FAIL |

## Dependency Audit

```bash
npm run ops:security-audit
```

| Severity | Count |
|----------|------:|
| critical | |
| high | |
| moderate | |
| low | |

### Remediation

| CVE / Package | Severity | Action | Owner |
|---------------|----------|--------|-------|
| | | | |

## Secret Exposure

| Check | Result | Notes |
|-------|--------|-------|
| No `SUPABASE_SERVICE_ROLE_KEY` in `src/` | PASS / FAIL | |
| No hardcoded JWTs in repo | PASS / FAIL | |
| Edge functions on allowlist only | PASS / FAIL | |
| No committed `.env` files | PASS / FAIL | |

### Edge Function Service Role Users

List functions confirmed on allowlist:

- 

### Findings

| Severity | Location | Detail |
|----------|----------|--------|
| | | |

## RLS Coverage

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/rls-coverage-report.sql > rls-report-YYYY-MM-DD.txt
```

| Check | Gap count | Result |
|-------|----------:|--------|
| Tables without policies | | PASS / FAIL |
| RLS disabled tables | | PASS / FAIL |
| Sensitive tables missing tenant isolation | | PASS / FAIL |

### Tables Missing Policies

- 

### Sensitive Tables Missing Tenant Isolation

- 

## Environment Variables Review

| Variable | Client-exposed? | Correct scope | Notes |
|----------|-----------------|---------------|-------|
| `VITE_SUPABASE_URL` | yes | public | |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | public | |
| `SUPABASE_SERVICE_ROLE_KEY` | no | server/scripts only | |
| Edge function secrets | no | Supabase dashboard | |

## Sign-Off

- [ ] Zero critical/high npm vulnerabilities (or documented exceptions)
- [ ] Zero secret exposure findings
- [ ] RLS gaps remediated or accepted with ADR
- [ ] Ready to proceed to Phase 3 (DR Drill)
