# Primitive adoption matrix

Tracks which modules use shared platform primitives. **Goal:** no greenfield code paths that bypass primitives.

Legend: **Y** = adopted, **P** = partial, **—** = not started.

| Module | Repository / data access | `evaluateAuthorize` | Async / mutation wrapper | Audit primitive | Realtime primitive | Trace IDs |
|--------|-------------------------|---------------------|--------------------------|-----------------|-------------------|-----------|
| Auth | P (orchestrator) | P | P | P | — | P |
| Billing | Y (`platformRepository`) | P | Y (`createAsyncOperation` postPayment) | — | — | Y (jobs + RPC) |
| Appointments | Y | P | — | — | Y (invalidate) | — |
| Patients | Y | P | — | — | Y | — |
| Reports | Y | P | — | — | Y | — |
| Notifications | Y | — | — | — | — | — |
| Admin | Y | P | — | P | — | — |
| Jobs | Y (`platformRepository` enqueue) | — | — | — | — | Y |

## Drift detection

- Run `npm run lint` (includes `scripts/architecture-lint.mjs`).
- Review PRs for new `supabase.from` outside `src/services` and `src/platform/data`.
- Extend this matrix when adding a new domain module.
