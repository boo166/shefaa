# Observability standard

## Correlation IDs

Propagate across layers:

| ID | Use |
|----|-----|
| `requestTraceId` | HTTP / user gesture |
| `operationTraceId` | Single logical operation |
| `workflowTraceId` | Multi-step saga (future) |
| `jobTraceId` | Worker execution |
| `realtimeTraceId` | Channel debug (future) |

Helpers: `src/platform/observability/traceContext.ts`.

## Metrics

- Auth: `emitAuthMetric` (existing).
- Platform runtime: `emitPlatformMetric` in `src/platform/observability/runtimeAnalytics.ts` (repository access, async operations, realtime subscribe/change, sampled high-frequency events).
- Required families:
  - `repository_access_start` / `repository_access_success` / `repository_access_failure`
  - `repository_access_latency`
  - `stale_context_rejected`
  - `unsafe_runtime_bypass_used`
- Subscribe sinks via `subscribePlatformMetrics` for dashboards or export adapters (Datadog/Sentry).
- Authorization denials: `authorization_denied` with safe labels (no PII).

## Logging

- No tokens, refresh payloads, or raw PHI.
- Bucket error codes (`bucketAuthErrorCode` pattern extended per domain).

## Dashboards

- Per-module SLO: error rate, p95 latency, denial rate, job backlog.
