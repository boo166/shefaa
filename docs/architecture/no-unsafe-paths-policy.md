# No unsafe paths policy

**Policy:** New features MUST use platform primitives for data access, authorization, async boundaries, audit, and tracing unless an ADR explicitly exempts the path.

## Required

1. **Data:** `supabase.from` / RPC only inside `src/services/**` (repositories) or `src/platform/data/**` (`platformRepository` gateway). Enforced by `npm run lint` → `scripts/architecture-lint.mjs` + ESLint restricted imports.
2. **Authorization:** Business decisions use `evaluateAuthorize` / `authorize` with capabilities; `assertAnyPermission` delegates to the engine. Server-side RLS/RPC remains authoritative.
3. **Jobs:** Enqueue through `jobRepository` (includes `_platform_trace` payload).
4. **Realtime:** Subscribe only via `realtimeService` / `useRealtimeSubscription` (principal-bound channels).
5. **Invariants:** Critical domain checks use `assertRuntimeInvariant` (see [runtime-invariants-standard.md](./runtime-invariants-standard.md)).

## Forbidden (without ADR)

- Direct Supabase client usage from `src/features/**` or `src/pages/**`.
- `localStorage` for secrets or ad-hoc caches in features/pages (use approved storage helpers).
- Unbounded retries or silent swallow of mutation failures.

## Exemptions

Document in `docs/architecture/adr/` with:

- Risk accepted
- Compensating controls
- Sunset date

Temporary code-level exception tags are allowed only as:

`@platform-exception owner=<id> expiry=<YYYY-MM-DD> reason=<text>`

Every exception must emit runtime telemetry: `unsafe_runtime_bypass_used`.
