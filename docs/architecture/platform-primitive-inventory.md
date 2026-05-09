# Platform primitive inventory

**Rule:** If implemented more than twice, extract a primitive.

## Implemented (code)

| Primitive | Location | Responsibility |
|-----------|----------|----------------|
| Authorization engine | `src/platform/authorization/` | Capability map, `evaluateAuthorize`, `authorize` |
| Runtime invariant | `src/platform/runtime/invariants.ts` | Dev throw / prod warn hook |
| UI invariant | `src/platform/runtime/uiInvariants.ts` | Client boundary asserts |
| Trace correlation | `src/platform/observability/traceContext.ts` | Request/operation/job IDs |
| Billing tenant assert | `src/platform/billing/invariants.ts` | `invoice_tenant_match` |
| Session shell | `src/components/shell/SessionBoundaryBadge.tsx` | Tenant/role/AAL display |
| Data access boundary | `src/services/**` + ESLint | All `supabase.from` |
| Auth fetch boundary | `src/services/supabase/supabaseAuthFetch.ts` | 401/403 orchestration |
| Realtime boundary | `src/services/realtime/` + hook | Principal-bound channel |

## Planned (roadmap)

| Primitive | Need |
|-----------|------|
| `platformRepository.query/mutate` | Unified tenant scope + trace + retry |
| `createAsyncOperation` | Mutation lifecycle + rollback hooks |
| `audit.log` | Structured audit with trace attachment |
| `realtimeChannel` facade | Dedup + backoff policy object |
| Feature gate server sync | Entitlements + fail-closed |

See [platform-primitives-roadmap.md](./platform-primitives-roadmap.md).
