# Chaos drill runbook

Use **staging** only. Injectors live under `tests/chaos/injectors/`.

## Scenarios (target state)

| Scenario | Technique | Pass criteria |
|----------|-----------|---------------|
| Token expires during payment | Short session + retry payment | No double charge; idempotency replay or single success |
| Tenant switch during realtime | `switchTenantAsync` + active subscription | Registry reconciles; no cross-tenant events |
| WS reconnect storm | throttle / disconnect injector | `realtime_reconnect_throttled` bounded; UI recovers |
| Stale tab after logout | second tab open | Stale context rejected; no writes |
| Duplicate workflow events | replay bus (future) | Single terminal state |
| Runtime mode change during mutation | `READONLY` containment + financial write | `RUNTIME_MODE_BLOCKED` or metric-only per flag |

## Execution

1. Enable `VITE_RUNTIME_POLICY_ENFORCE=1` on staging to validate fail-closed paths.
2. Run Playwright or manual flows with `withLatency` where applicable.
3. Capture metrics snapshot before/after.

## References

- `tests/chaos/scenarios/chaos-scenarios.test.ts` — smoke on injectors.
- `docs/operations/production-rollout-checklist.md` — SLO / rollback alignment.
