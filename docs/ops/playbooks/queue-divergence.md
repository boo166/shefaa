# Queue Divergence Playbook

Use when appointment shows **Completed/Cancelled/No-show** but waiting room still shows active queue.

## Symptoms

- Completed appointment still in Waiting room
- Finding codes: `COMPLETED_WITH_ACTIVE_QUEUE`, `CANCELLED_WITH_ACTIVE_QUEUE`, `NO_SHOW_WITH_WAITING_QUEUE`

## Runtime Ops steps

1. Open **Runtime operations**
2. Run **Cross-domain reconciliation → Appointment dry run**
3. Review findings for queue/appointment status mismatch evidence
4. Export forensic bundle if multiple appointments affected

## Resolution

1. Identify appointment_id and queue_id from finding evidence
2. If legitimate terminal state: run appointment lifecycle command to close queue (`complete`, `cancel`, or `no_show`) — do not delete queue rows manually
3. Re-run appointment reconciliation dry — expect zero critical findings
4. If drift was caused by partial failure: check recovery timeline for stale epoch aborts

## Escalate when

- Manual lifecycle command fails with CONFLICT
- Multiple tenants affected simultaneously (platform incident)

See also: [reconciliation-triage.md](./reconciliation-triage.md)
