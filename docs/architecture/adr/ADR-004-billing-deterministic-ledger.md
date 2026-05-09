# ADR-004: Billing deterministic ledger posture

- **Status:** accepted  
- **Date:** 2026-05-09  

## Context

Invoice payments must remain correct under retries, crashes, and concurrent posters. Client-side amounts are not authoritative.

## Decision

1. **RPC authority:** Monetary movement goes through `post_invoice_payment` with `p_idempotency_key`, `p_request_hash`, and structured `result_code` (existing).
2. **Gateway:** All table/RPC access for billing uses `platformRepository` with tenant-scoped stale-context rejection.
3. **Async boundary:** `billingService.postPayment` wraps the RPC in `createAsyncOperation` with bounded retries and timeout.
4. **Future:** Append-only invoice/payment domain events and scheduled reconciliation jobs (implementation when schema allows).

## Consequences

- **(+)** Deterministic client orchestration; fewer double-submit surprises.  
- **(-)** Super-admin smoke tests must supply `tenantOverride` aligned with target tenant.  
- **Follow-up:** Immutable ledger table + reconciliation ADR when finance schema is extended.
