# Production rollout checklist

## SLOs / SLIs (sketch)

| Area | SLI | Notes |
|------|-----|--------|
| Billing | `billing.reconciliation_tick` success rate vs payment attempts | Alert on drop |
| Realtime | `realtime_reconnect_throttled` rate | Storm detection |
| Runtime | `policy.runtime_blocked` by mode | Expected in drills only |
| Auth | `stale_context_rejected` | Tenant-switch stress |

Wire dashboards to `emitPlatformMetric` / existing analytics sinks.

## Alerting

- Page on sustained **5xx** on payment RPC paths.
- Warn on **mutation freeze** duration over threshold during tenant switches.
- Track **workflow.compensation_triggered** spikes.

## Rollback

- Keep migrations **forward-only** with feature flags for risky paths (`VITE_*` / server flags).
- **Runtime**: use `RuntimeMode` / local containment only with runbook approval; prefer config rollback first.

## Incident handling

1. Confirm **runtime mode** and **health** (`RuntimeOpsPage` at `/admin/ops/runtime` for super-admins).
2. Capture **trace IDs** from `async_operation_*` and `billing.reconciliation_tick` metrics.
3. Freeze billing writes if ledger integrity uncertain (`SAFE_MODE` / subsystem freeze per policy).

## Recovery drills

- Quarterly: tenant switch under load, payment idempotency replay, WS reconnect storm (see `tests/chaos`).
- Document outcomes in incident tracker.

## Canary / feature flags

- Roll out repository **policy enforce** flags (`VITE_RUNTIME_POLICY_ENFORCE`, etc.) in stages: staging → canary tenant → full.

## Operational freeze controls

- Align marketing freezes with **mutation freeze** windows for cutover; communicate epoch bumps to support.
