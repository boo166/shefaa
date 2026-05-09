# Failure containment model

Maps failure modes to **bounded, deterministic** containment. Prefer fail-closed + kill switches over unbounded retry.

| Failure | Detection | Containment | Recovery | Kill switch / notes |
|---------|-----------|-------------|----------|---------------------|
| Auth refresh storm | HTTP 401 rate, metric `refresh_attempt` | Single-flight refresh queue | Backoff; user reauth | `VITE_AUTH_KILL_SWITCH` |
| 403 policy denial | 403 on data plane | No token refresh churn (`supabaseAuthFetch`) | Step-up / tenant mode | Server policy |
| Tenant mismatch | `evaluateAuthorize`, RLS | Deny mutation; teardown realtime | Force tenant context reload | Runtime invariant |
| Realtime drift / stale principal | Channel key vs `sessionVersion` | Unsubscribe; new channel | Resubscribe after auth stable | Client reconnect backoff |
| Billing conflict | RPC result codes, idempotency replay | No double post; surface retryable | User retry with same idempotency key | Ledger RPC |
| Job worker unavailable | `invoke` error | Job row remains for worker | Retry worker / DLQ | Ops runbook |
| Storage path violation | Signed URL / path guard | Reject upload / download | Regenerate URL | Tenant path invariant |
| Partial DB outage | Timeouts, 5xx | Circuit-break reads; safe mode UI | Degraded banner | Feature flag |

## Escalation

1. **Contain** — stop writes, preserve audit trail.
2. **Correlate** — `requestTraceId` / `operationTraceId` / `jobTraceId`.
3. **Communicate** — incident banner for admins if SLO breached.
