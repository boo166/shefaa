# ADR-003: Realtime tenant + principal binding

- **Status:** accepted  
- **Date:** 2026-05-09  

## Context

Realtime channels must not survive across tenant switches or session generation changes.

## Decision

- Postgres changes filtered with `tenant_id=eq.{tenant}`.
- Channel name: `realtime:{tenantId}:{principalKey}:{tables}` where `principalKey` is `sessionVersion` or `u:{userId}`.
- `useRealtimeSubscription` depends on effective tenant (including super-admin override), `userId`, and `sessionVersion`.

## Consequences

- **(+)**: Old channels cannot receive events for a new principal without resubscribe.  
- **(-)**: Requires `sessionVersion` to bump on meaningful auth changes (already in auth store).  
- **Follow-up:** Evaluate server-side replay tokens before enabling strict ordering guarantees.
