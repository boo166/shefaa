# Notification Dead Letter Playbook

Use when notifications stop delivering and outbox rows reach `DEAD_LETTER`.

## Symptoms

- Runtime Ops **Dead letters** count > 0
- Users report missing appointment/billing alerts
- `run_notification_reconciliation` reports delivery drift

## Runtime Ops steps

1. Open **Runtime operations**
2. Check **Durable event delivery → Dead letters**
3. Review **Incident timeline** for `notification_delivered` audit gaps
4. Inspect recent outbox rows in the **Event outbox** table
5. Use **Replay** on failed/retry/dead-letter outbox rows (one at a time)

## Resolution

1. Run **Cross-domain reconciliation → Notification dry run**
2. Replay the outbox event after confirming idempotent delivery key
3. Verify delivery audit via workflow trace (`listDeliveryAuditByWorkflowTraceId`)
4. Run notification reconciliation live if drift persists
5. Confirm dead letter count returns to 0

## Escalate when

- Replay succeeds but users still lack notifications (check recipient user_id mapping)
- Dead letters recur within 15 minutes (worker or edge function outage)

See also: [durable-event-delivery.md](../durable-event-delivery.md)
