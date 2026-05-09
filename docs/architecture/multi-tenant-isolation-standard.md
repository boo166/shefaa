# Multi-tenant isolation standard

## Non-negotiables

1. **Never trust** tenant id from the client for authorization—derive from session + RLS.
2. **Effective tenant** for super-admin is `tenantOverride`; block tenant RPCs without it (`getTenantContext`).
3. **Caches and storage keys** must include `(tenantId, userId)` (see staging-auth runtime helpers).
4. **Realtime filters** must include `tenant_id=eq.{tenant}` and channel namespace must include tenant + principal generation.

## Runtime checks

- `evaluateAuthorize` with `context.resourceTenantId` for resource-scoped actions.
- `assertInvoiceTenantScope` pattern for billing reads.
- Cross-tenant attempts → metric `authorization_denied` with `tenant_mismatch`.

## Testing

- pgTAP / SQL adversarial tests for RLS.
- Playwright staging-auth scenarios for cache isolation.
