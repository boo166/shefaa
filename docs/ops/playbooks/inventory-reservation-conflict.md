# Inventory Reservation Conflict Playbook

Use when dispense fails with reservation conflicts or stock drift.

## Symptoms

- Pharmacist cannot dispense reserved medication
- Orphan `medication_reservations` with status `active`
- Inventory reconciliation or negative stock alerts

## Runtime Ops steps

1. Confirm tenant pharmacy feature enabled
2. Review audit logs for `command_medication_reserve` / `command_medication_dispense` trace ids
3. Run inventory clinical safety checks via staging SQL if available

## Resolution

1. Identify reservation id and medication batch
2. If reservation is stale: run `command_medication_release` for the reservation
3. Verify `medications.stock` and `reserved_quantity` reconcile
4. Retry dispense with new reservation
5. Run dry inventory checks — stock must never be negative

## Escalate when

- Expired batch dispense attempts (clinical safety block — use non-expired batch)
- Concurrent dispense load test failures in production

See also: `supabase/tests/inventory_clinical_safety.sql`
