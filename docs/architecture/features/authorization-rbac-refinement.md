# Authorization / RBAC refinement

Apply [refinement-protocol.md](../refinement-protocol.md) plus:

## Domain invariants

- Every sensitive RPC must enforce tenant + role server-side.
- Client `evaluateAuthorize` must pass `resourceTenantId` when operating on a concrete row.
- Stale role: session refresh must bump `sessionVersion`; deny if server rejects.

## Threat model

- Privilege escalation via client-only checks.
- Cross-tenant IDOR (predictable UUIDs).
- Super-admin without `tenantOverride` performing tenant data ops.

## Telemetry

- `authorization_denied` with `code`, capability/permission labels (no raw emails).

## Deliverables checklist

- [ ] Migrate service-layer checks to capabilities where possible
- [ ] Expand adversarial tests (`admin.service.authz.test.ts` pattern)
- [ ] Document capability catalog in `capabilities.ts`
