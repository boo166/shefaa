# Billing refinement

Apply [refinement-protocol.md](../refinement-protocol.md) plus:

## Financial invariants

- Immutable ledger events for money movement (RPC-owned).
- Idempotency keys on `post_invoice_payment` (existing); extend to all write paths.
- `invoice_tenant_match` on reads (`assertInvoiceTenantScope`).

## Threat model

- Double spend / duplicate payment retries.
- Tenant confusion on invoice export.

## UX

- Timeline of invoice states; show idempotency replay as “already recorded” not error.

## Deliverables checklist

- [x] `platformRepository` for invoices / invoice_payments / RPC gateway (`ADR-004`)
- [x] `createAsyncOperation` around `postPayment` RPC path
- [ ] Reconciliation job + admin view
- [ ] Adversarial tests for RPC result codes
- [ ] Cache invalidation policy documented
- [ ] **Financial Critical** tier per [module-certification.md](../module-certification.md)
