# Production rollout checklist

## SLOs / SLIs (sketch)

| Area | SLI | Notes |
|------|-----|--------|
| Billing | `billing.reconciliation_tick` success rate vs payment attempts; `billing.reconciliation_findings.critical` | Alert on drop or any critical finding |
| Realtime | `realtime_reconnect_throttled` rate | Storm detection |
| Runtime | `policy.runtime_blocked` by mode | Expected in drills only |
| Auth | `stale_context_rejected` | Tenant-switch stress |

Wire dashboards to `emitPlatformMetric` / existing analytics sinks.

### Load certification gates (staging game-day)

Full runbook: [docs/ops/staging-load-cert-runbook.md](../ops/staging-load-cert-runbook.md).

| Script | Volume default | Pass gate |
|--------|----------------|-----------|
| `scripts/load-cert/seed-staging-volume.mjs` | 100k patients / 100k invoices / 1M notifications | target counts reached |
| `scripts/load-cert/verify-seed.mjs` | same targets | all tables PASS before game-day |
| `scripts/load-cert/billing-payments.mjs` | 1000 payments (use 100k on game-day) | p95 ≤ 500ms; zero duplicate payments; reconciliation critical = 0 |
| `scripts/load-cert/appointment-bookings.mjs` | 500 slot attempts | exactly 1 winner; zero overlap violations |
| `scripts/load-cert/inventory-deductions.mjs` | 200 dispenses | stock never negative |
| `scripts/load-cert/notification-outbox-deliveries.mjs` | 5000 outbox events | production path drained; reconciliation critical = 0 |
| `scripts/load-cert/notification-deliveries.mjs` | 5000 direct RPCs | authority stress only (not game-day default) |
| `scripts/load-cert/concurrent-users.mjs` | 50 users × 20 ops | p95 ≤ 2000ms; error rate ≤ 1% |

```bash
npm run supabase:sync-env
npm run load-cert:game-day
```

CI concurrency proofs: `supabase/tests/load/*.sql` via `npm run test:db`.

## Alerting

- Page on sustained **5xx** on payment RPC paths.
- Warn on **mutation freeze** duration over threshold during tenant switches.
- Track **workflow.compensation_triggered** spikes.

## Rollback

- Keep migrations **forward-only** with feature flags for risky paths (`VITE_*` / server flags).
- **Runtime**: use `RuntimeMode` / local containment only with runbook approval; prefer config rollback first.

## Incident handling

1. Confirm **runtime mode** and **health** (`RuntimeOpsPage` at `/admin/ops/runtime` for super-admins).
2. Capture **trace IDs** from `async_operation_*`, `billing.reconciliation_tick`, and reconciliation findings.
3. Freeze billing writes if ledger integrity uncertain (`SAFE_MODE` / subsystem freeze per policy).

## Recovery drills

- Quarterly: tenant switch under load, payment idempotency replay, WS reconnect storm (see `tests/chaos`).
- Document outcomes in incident tracker.

## Canary / feature flags

- Roll out repository **policy enforce** flags (`VITE_RUNTIME_POLICY_ENFORCE`, etc.) in stages: staging → canary tenant → full.

## Operational freeze controls

- Align marketing freezes with **mutation freeze** windows for cutover; communicate epoch bumps to support.
