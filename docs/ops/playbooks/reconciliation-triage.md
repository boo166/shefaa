# Reconciliation Triage Playbook

Use for any open reconciliation finding across billing, patient, appointment, or notification domains.

## Severity guide

| Severity | Response |
|----------|----------|
| critical | Acknowledge within 15 minutes; investigate before next billing tick |
| warning | Investigate within 4 hours; may batch resolve after dry-run verification |

## Finding workflow (Runtime Ops)

1. **Acknowledge** — operator owns the finding
2. **Investigate** — export finding bundle; correlate trace ids
3. **Resolve** or **False positive** — document evidence in ticket
4. Re-run **dry reconciliation** to confirm zero open critical findings

## Domain-specific codes

### Billing

- `INVOICE_PAYMENT_TOTAL_MISMATCH` → [payment-replay.md](./payment-replay.md)
- `REFUND_OVER_PAID`, `PAYMENT_REVERSAL_MISMATCH` → billing post-payment commands
- `IDEMPOTENCY_KEY_STALE_STARTED` → replay or expire stale command

### Appointment

- `COMPLETED_WITH_ACTIVE_QUEUE` → [queue-divergence.md](./queue-divergence.md)

### Patient

- `retention_expired_patient`, `legal_hold_patient_retained` → retention policy review

### Notification

- Delivery drift → [notification-dead-letter.md](./notification-dead-letter.md)

## Buttons in Runtime Ops

- **Dry run** / **Live run** (billing panel)
- **Cross-domain reconciliation** dry runs (patient, notification, appointment)
- **Export finding bundle** / **Export forensic bundle**
