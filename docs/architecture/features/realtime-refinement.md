# Realtime refinement

Apply [refinement-protocol.md](../refinement-protocol.md) plus:

## Lifecycle

- Channel naming includes tenant + `sessionVersion` / user id (see [realtime-lifecycle-standard.md](../realtime-lifecycle-standard.md)).
- Hook deps: `tenantId`, `userId`, `sessionVersion`.

## Threat model

- Stale subscription after logout (mitigated by teardown + new channel id).
- Event flood invalidating cache (dedup keys in hook).

## Chaos

- Forced disconnect / reconnect storms (`tests/chaos`).

## Deliverables checklist

- [ ] Backoff policy object
- [ ] UI indicator for “realtime degraded”
- [ ] Replay protection ADR if server adds ordering tokens
