# State machine standard

## Rules

1. **Explicit states** — no “implicit” loading/error buckets as the only model for critical flows.
2. **Invalid transitions** — rejected and logged (auth uses `assertAuthTransition`).
3. **Terminal states** — define cleanup (subscriptions, timers, caches).
4. **Documentation** — state diagram in feature refinement doc or ADR.

## UI alignment

Map machine states to UI:

- `authenticated`, `refreshing`, `reauth_required`, `mfa_required`, `tenant_switching`, `degraded`, etc.

## Backend alignment

- Financial and job workflows use DB-enforced states or RPC result codes—not only client flags.
