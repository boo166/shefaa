# Appointment notification ordering

## Intended ordering model

1. **Source of truth**: database row for `appointments` (and `appointment_queue` when used).
2. **Domain events** (`emitDomainEvent`) are emitted **after** successful repository commits in services.
3. **Realtime**: postgres changes on `appointments` / `appointment_queue` are delivered **eventually**; subscribers must tolerate reordering within a short window unless a monotonic version is added.

## Failure modes

- **Duplicate delivery**: reconnect or replay may surface the same event twice; handlers must be **idempotent** (e.g. keyed on `appointment_id` + `updated_at` or server version).
- **Stale tab**: UI epoch / tenant switch may leave subscriptions on an old channel; `registerRealtimeSubscriptionIntent` reconciles on `TENANT_CONTEXT_CHANGED` and mode changes.
- **Readonly / incident mode**: mutation-heavy tables may be **filtered** from realtime subscriptions; UI should show governance strip and avoid assuming live updates.

## Future hardening

- Add **`event_version`** (integer) or **`sequence`** per appointment row incremented on each mutation for strict ordering.
- Fan-out notifications through a **single workflow** step after commit to align with billing-style convergence patterns.
