# ADR-005: Billing reconciliation authority

- **Status:** accepted
- **Date:** 2026-05-10

## Context

Payment posting is already DB-authoritative through `post_invoice_payment`, but operators still need a durable way to detect financial drift after retries, stale workflows, or historical data defects.

## Decision

1. `run_billing_reconciliation` is the authoritative validator for billing drift.
2. Persisted runs live in `billing_reconciliation_runs`; persisted findings live in `billing_reconciliation_findings`.
3. Dry runs return the same summary shape but do not write run or finding rows.
4. Findings store IDs, codes, severities, trace IDs, and numeric evidence only. They must not store patient names, emails, phone numbers, notes, or other PHI.
5. The runtime ops console reads latest runs, open findings, active workflows, mutation freeze state, realtime health, and transition history. It may run dry reconciliation only.

## Finding Taxonomy

Initial findings cover:

- `INVOICE_PAYMENT_TOTAL_MISMATCH`
- `INVOICE_BALANCE_INVALID`
- `INVOICE_STATUS_MISMATCH`
- `PAYMENT_ORPHANED_OR_TENANT_MISMATCH`
- `IDEMPOTENCY_KEY_STALE_STARTED`
- `IDEMPOTENCY_PAYLOAD_INVALID`
- `IDEMPOTENCY_DUPLICATE_COMMITTED_PAYMENT`

## Consequences

- Operators get a financial truth validator without adding another payment path.
- Automatic repair is intentionally out of scope until findings are trusted in staging.
- Scheduled execution can be added later; the RPC contract is the stable boundary.
