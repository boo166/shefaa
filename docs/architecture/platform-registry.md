# Platform registry

Authoritative map of primitives, standards, module maturity, ownership, and rollout status. Update on every hardening wave or ownership change.

## Primitives

| Primitive | Status | Owner | Consumers | Coverage | Risk |
|-----------|--------|-------|-------------|----------|------|
| `evaluateAuthorize` / `authorize` | Active | Platform | `permissions.ts`, services (expand) | Partial | Authz drift if bypassed |
| `assertRuntimeInvariant` | Active | Platform | Billing, UI | Partial | Silent prod if listeners missing |
| `buildTracePayload` / trace IDs | Active | Platform | `job.repository` | Partial | Low |
| `SessionBoundaryBadge` | Active | Platform UI | `ClinicLayout` | Shell only | Medium |
| Repository + `supabase.from` boundary | Active | Services | All data access | High | High if lint disabled |
| `platformRepository` middleware data plane | Active | Platform | Billing, jobs, reports/patients/notifications (rolling) | Medium | Ordering drift if unmanaged |
| Realtime principal-bound channel | Active | Realtime | `useRealtimeSubscription` | Medium | Stale sub if version not bumped |

## Standards registry

| Standard | Doc | Status |
|----------|-----|--------|
| Refinement protocol | [refinement-protocol.md](./refinement-protocol.md) | Active |
| No unsafe paths | [no-unsafe-paths-policy.md](./no-unsafe-paths-policy.md) | Active |
| Runtime invariants | [runtime-invariants-standard.md](./runtime-invariants-standard.md) | Active |
| Multi-tenant isolation | [multi-tenant-isolation-standard.md](./multi-tenant-isolation-standard.md) | Active |
| State machines | [state-machine-standard.md](./state-machine-standard.md) | Active |
| Observability | [observability-standard.md](./observability-standard.md) | Active |
| Failure handling | [failure-handling-standard.md](./failure-handling-standard.md) | Active |
| RPC authorization | [rpc-authorization-standard.md](./rpc-authorization-standard.md) | Active |
| Realtime lifecycle | [realtime-lifecycle-standard.md](./realtime-lifecycle-standard.md) | Active |
| UI runtime | [ui-runtime-standard.md](./ui-runtime-standard.md) | Active |
| Platform middleware | [platform-middleware-standard.md](./platform-middleware-standard.md) | Active |

## Modules

| Module | Runtime grade | Isolation grade | Observability | Chaos coverage | Canary ready | Owner | Notes |
|--------|---------------|-----------------|---------------|----------------|--------------|-------|-------|
| Auth / session | A | A | A | Partial (staging-auth) | Yes | Platform | Baseline template |
| Authorization (capability graph) | B | B | B | Low | Partial | Platform | Engine in `src/platform/authorization` |
| Billing | B | B | B | Low | Partial | Domain | Idempotent RPC + tenant invariant on read |
| Realtime | B | B | B | Low | Partial | Platform | Channel bound to `sessionVersion` + `userId` |
| Jobs / queues | C | B | C | Low | No | Platform | Trace payload injected |
| Notifications | C | B | C | Low | No | Domain | TBD convergence |
| Reports | C | B | C | Low | No | Domain | Converging to platformRepository |
| Patients | C | B | C | Low | No | Domain | Converging to platformRepository |
| Admin | C | B | C | Low | No | Platform | Converging to platformRepository |
| Storage | C | B | C | Low | No | Domain | TBD signed URL hardening |
| UI shell | B | B | B | Low | Partial | Platform | Session boundary badge |

*Grades: see [runtime-maturity-scoring.md](./runtime-maturity-scoring.md).*

## Known risks (rolling)

1. Legacy call sites may still use `hasPermission` directly instead of `evaluateAuthorize` with resource tenant.
2. Job payload `_platform_trace` must be stripped or ignored by workers to avoid PII growth; document in worker ADR when hardened.
3. Super-admin realtime requires `tenantOverride` set; hook already uses effective tenant.
4. Temporary `@platform-exception` escape hatches must carry owner + expiry and emit `unsafe_runtime_bypass_used`.

## Rollout status

| Wave | Theme | Status |
|------|-------|--------|
| 1 | Governance + CI | In progress |
| 2 | Capability graph + authz telemetry | In progress |
| 3 | Billing ledger + reconciliation | Planned |
| 4 | Realtime lifecycle + chaos | In progress |
| 5 | Storage / jobs / notifications | Planned |
| 6 | Operational UI shell | In progress |
