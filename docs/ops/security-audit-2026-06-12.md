# Security Audit Results

Date: 2026-06-12  
Operator: automated (`npm run ops:generate-gates`)

## Summary

| Gate | Result |
|------|--------|
| Dependency audit (`npm audit`) | FAIL |
| Secret exposure scan | PASS |
| Edge function service role allowlist | PASS |
| RLS coverage report | PENDING — run `psql` with DB URL |
| **Overall security gate** | FAIL |

## Dependency Audit

```bash
npm run ops:security-audit
```

| Severity | Count |
|----------|------:|
| critical | 3 |
| high | 14 |

<details>
<summary>Full audit output</summary>

```
# Security Audit Report — 2026-06-12

## Dependency Audit (npm audit)

| Severity | Count |
| --- | ---: |
| critical | 3 |
| high | 14 |
| moderate | 8 |
| low | 1 |
| info | 0 |
| total | 26 |

## Secret Exposure Scan

- PASS: no client-side service role references detected in scanned paths.

## Edge Function Service Role Allowlist

- PASS: all edge functions using service role are on the approved list.

## Environment Files

- .env.example present: yes
- WARN: found env files in repo root: .env

## Gate: FAIL
```

</details>

## Secret Exposure

| Check | Result |
|-------|--------|
| No service role in `src/` | PASS |
| Edge functions on allowlist | PASS |
| Committed `.env` files | WARN |

## RLS Coverage

Run on staging:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/rls-coverage-report.sql
```

## Remediation Required

- Address 3 critical and 14 high npm vulnerabilities before certification.

- Ensure `.env` is gitignored and not committed.


## Sign-Off

- [ ] Zero critical/high npm vulnerabilities (or documented exceptions)
- [ ] RLS report run on staging with zero sensitive-table gaps
- [ ] Ready to proceed to Phase 3 (DR Drill)
