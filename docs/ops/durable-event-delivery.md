# Durable Domain Event Delivery

Shefaa domain events use a database-owned outbox. Application mutations persist `domain_events`; the database trigger writes handler-specific `event_outbox` rows in the same committed transaction. The `event-delivery-worker` Edge Function drains those rows through claim/complete/fail RPCs and records every try in `event_delivery_attempts`.

## Lifecycle

`PENDING -> PROCESSING -> DELIVERED`

Failures move to `RETRY` with exponential backoff. Exhausted rows move to `DEAD_LETTER` and are copied into `dead_letter_events` for operator review. Super admins can replay `FAILED`, `RETRY`, and `DEAD_LETTER` rows from the Runtime Ops page.

## Delivery Guarantees

| Event Type | Guarantee |
| --- | --- |
| Billing | at least once |
| Notifications | at least once |
| Audit | exactly once persistence |
| Analytics | best effort |
| Realtime UI | eventually consistent |

## Transactional Billing Authority

Invoice payment settlement now uses `post_invoice_payment` as the transactional authority. The RPC updates financial state, records idempotency, writes audit evidence, creates the `InvoicePaid` domain event, and lets the database outbox trigger enqueue handlers before the transaction commits.

This means payment settlement no longer depends on a follow-up frontend/service call to `emitDomainEvent`. A committed payment has a committed domain event and outbox rows; if event creation fails, the payment transaction aborts.

## Worker

The v1 worker is `supabase/functions/event-delivery-worker`. It can be invoked by a super admin or by scheduled infrastructure with `EVENT_DELIVERY_WORKER_SECRET` passed as `x-worker-secret`.

Optional pg_cron scheduling is available through:

```sql
select public.schedule_event_delivery_worker(
  '*/2 * * * *',
  'https://<project-ref>.functions.supabase.co/event-delivery-worker',
  '<strong worker secret>'
);
```

The migration intentionally does not hard-code a project URL. It only auto-schedules when `app.settings.event_delivery_worker_url` and `app.settings.event_delivery_worker_secret` are configured.
