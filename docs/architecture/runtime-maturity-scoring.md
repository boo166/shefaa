# Runtime maturity scoring

**Rule:** “Feature complete” ≠ production hardened. Each module earns a grade before canary.

## Dimensions (0–3 each)

Score each dimension:

| Dimension | 0 | 1 | 2 | 3 |
|-----------|---|---|---|---|
| Authorization | Ad-hoc | Client gates only | Central engine + server RPC | Capability graph + adversarial tests |
| Tenant isolation | Trust client tenant | RLS only | RLS + runtime asserts | RLS + cross-tenant chaos |
| Replay safety | None | Some idempotency | Critical paths idempotent | Measured dedup |
| Observability | Logs only | Metrics for errors | Traces + SLO dashboards | Anomaly alerts |
| Rollback | Manual | Documented | Automated canary rollback | Game-day verified |
| Chaos coverage | None | Staging scripts | Automated chaos suite | Continuous chaos |
| Runtime invariants | None | Auth only | Domain invariants | Prod containment hooks |
| Stale-context protection | None | Partial | Session version + teardown | Multi-tab proven |
| Idempotency | None | Writes partial | Financial + jobs | Audited keys |
| Operational tooling | None | Runbook | Dashboards + on-call | Self-serve diagnostics |

**Sum / 30 → grade:**

| Grade | Score | Canary |
|-------|-------|--------|
| A | 24–30 | Allowed (default SLO) |
| B | 18–23 | Allowed with named risk owner + rollback |
| C | 12–17 | Staging only |
| D | 0–11 | No production traffic |

## Current snapshot

Recorded in [platform-registry.md](./platform-registry.md); update after each refinement sprint.
