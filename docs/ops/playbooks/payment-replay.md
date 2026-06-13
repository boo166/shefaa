# Payment Replay Playbook

Use when billing payment succeeded in UI but invoice balance or reconciliation is wrong.

## Symptoms

- Duplicate payment anxiety after network retry
- Billing reconciliation finding: `INVOICE_PAYMENT_TOTAL_MISMATCH` or stale idempotency
- Runtime Ops shows payment workflow trace with replay markers

## Runtime Ops steps

1. Open **Admin → Runtime operations** (`/admin/ops/runtime`)
2. **Refresh** and locate the invoice workflow in **Incident timeline**
3. **Export forensic bundle** for the affected trace session
4. Review **Billing reconciliation → Open findings**
5. Check **Durable event delivery** dead letter count; replay failed outbox rows if present

## Resolution

1. Confirm idempotency: search `command_idempotency` for `invoice_payment_post` key — committed replay is safe
2. Run **Dry reconciliation** — expect zero new critical findings if state is healthy
3. If duplicate payment exists: use **payment reversal** (not manual delete) via billing service
4. Run **Live reconciliation** and acknowledge/resolve findings
5. Re-run dry reconciliation to confirm `critical_count = 0`

## Escalate when

- Live reconciliation persists critical findings after reversal
- Cross-tenant payment FK or tenant mismatch errors appear

See also: [reconciliation-triage.md](./reconciliation-triage.md), [durable-event-delivery.md](../durable-event-delivery.md)
