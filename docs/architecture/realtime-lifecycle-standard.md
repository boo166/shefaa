# Realtime lifecycle standard

## Channel identity

Format: `realtime:{tenantId}:{principalKey}:{tablesKey}`

- `principalKey` = `sessionVersion` or fallback `u:{userId}` so **logout / tenant switch / session bump** forces a new channel.

## Subscription rules

1. Subscribe only through `realtimeRuntime.subscribeEntity` (used internally by `realtimeService.subscribeToTenantTables`).
2. Metrics: `realtime_subscribe`, `realtime_change`, `realtime_unsubscribe` via platform observability.
3. Backoff schedule for future reconnect hooks: `REALTIME_RECONNECT_BACKOFF_MS` in `src/platform/realtime/realtimeRuntime.ts`.
4. `useRealtimeSubscription` depends on `tenantId`, `userId`, `sessionVersion`.
5. Unsubscribe in effect cleanup—no leaked channels across principal change.

## Channel certification checklist

Every production channel must document:

- principal binding strategy
- tenant binding strategy
- teardown guarantees on auth/tenant changes
- replay handling policy
- reconnect strategy + backoff bounds
- dedup semantics for event application

## Events

- Treat payloads as untrusted; reconcile with query refetch.
- Dedup invalidations (existing `Map` dedup in hook).

## Future

- Replay tokens / server sequence numbers (document in ADR before enabling).
