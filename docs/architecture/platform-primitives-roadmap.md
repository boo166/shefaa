# Platform primitives roadmap

Ordered extraction to maximize leverage and minimize churn.

## Phase 1 — Boundaries (done / in progress)

- [x] Central authorize / capability map
- [x] Architecture lint for `supabase.from` placement
- [x] Realtime principal-bound channels
- [x] Job trace payload injection

## Phase 2 — Data plane

- [x] `platformRepository` gateway (tenant injection, stale-context rejection, metrics) — pilot: billing, jobs
- [ ] Expand to remaining repositories + tighten lint on raw `.from(`
- [x] Standard mutation helper (`createAsyncOperation`) — pilot: billing postPayment
- [ ] Optimistic concurrency helpers library-wide

## Phase 3 — Observability

- [ ] OpenTelemetry-style propagation (if exporting to APM)
- [ ] Authorization denial dashboard

## Phase 4 — UX shell

- [ ] Global session overlay component (safe mode, MFA, tenant switch freeze)
- [ ] Capability-driven nav config (single source)

## Phase 5 — Chaos

- [ ] Wire `tests/chaos` injectors into Playwright staging profile
