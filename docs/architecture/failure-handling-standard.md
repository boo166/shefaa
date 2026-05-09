# Failure handling standard

## Principles

1. **Fail-closed** for auth, billing, and tenant scope.
2. **Bounded retries** with jitter; classify retryable vs fatal.
3. **Idempotency** for payments, job side effects, and notification dispatch.
4. **User-visible** errors: stable codes + recovery action + optional reference id.

## Patterns

- HTTP: `supabaseAuthFetch` for 401/403 boundary.
- RPC: map Postgres codes to `ServiceError` with retry hints.
- UI: operational shell banners for degraded modes (see [ui-runtime-standard.md](./ui-runtime-standard.md)).

## Rollback

- Canary criteria documented per module in [platform-registry.md](./platform-registry.md).
