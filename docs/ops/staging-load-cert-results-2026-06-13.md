# Staging Load Certification Results

Date: 2026-06-13  
Target: **local** (http://127.0.0.1:54321) — pre-flight; staging sign-off still required  
Operator: automated (`npm run ops:run-load-game-day`)

> Note: Run used reduced local volumes (1k/1k/10k). Staging sign-off requires 100k/100k/1M.

## Summary

| Gate | Result |
|------|--------|
| Volume seed | **PASS** |
| Seed verification | **PASS** |
| Billing payments | **PASS** |
| Appointment bookings | **PASS** |
| Inventory deductions | **PASS** |
| Notifications (outbox path) | **PASS** (pipeline fallback; worker 504 timeout) |
| Concurrent users (50) | **PARTIAL** (p95 2240ms > 2000ms gate) |
| **Overall load gate** | **PARTIAL** |

## Volume Counts

| Table | Actual | Target (local run) |
|-------|-------:|-------------------:|
| patients | 1,000 | 1,000 |
| invoices | 1,001 | 1,000 |
| notifications | 10,301 | 10,000 |

## Latency / SLO

| Step | Elapsed | Key SLO |
|------|--------:|---------|
| billing | 26.7s | p95=455.8ms ✅ (≤500ms) |
| appointments | 10.9s | 1 winner / 99 conflicts ✅ |
| inventory | 3.0s | stock never negative ✅ |
| notifications-outbox | 190s | delivered=301/200; recon critical=0 ✅ |
| concurrent | 15.0s | error=0%; **p95=2240ms ❌** (≤2000ms) |

## Infrastructure (post-run)

| Metric | Value |
|--------|------:|
| outbox_pending | 0 |
| outbox_failed | 0 |
| dead_letter_24h | 0 |
| billing_recon_critical | 0 |
| notification_recon_critical | 0 |

## Findings

1. **Edge worker timeout (504)** under outbox load — fell back to RPC pipeline; investigate worker scaling on staging.
2. **202 pipeline delivery failures** during fallback (still met delivered SLO due to retries/extra events).
3. **Concurrent p95** slightly over gate on local Docker — re-test on staging with production-like resources.

## Staging Sign-Off (required)

```bash
set SUPABASE_TARGET=remote
set PATIENT_COUNT=100000
set INVOICE_COUNT=100000
set NOTIFICATION_COUNT=1000000
set OUTBOX_EVENT_COUNT=5000
npm run ops:run-load-game-day
```

## Sign-Off

- [x] Seed verification PASS (local subset)
- [x] Billing p95 within SLO
- [x] Reconciliation critical = 0
- [ ] Full 100k/1M staging run
- [ ] Concurrent p95 within SLO on staging
- [ ] Edge worker path (no 504) on staging
