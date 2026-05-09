# Platform Middleware Standard

Deterministic middleware execution contract for `platformRepository`.

## Ordering (mandatory)

1. `traceMiddleware`
2. `authBoundaryMiddleware`
3. `retryClassificationMiddleware`
4. `metricsMiddleware`
5. `invariantMiddleware`

## Allowed Side Effects

- `traceMiddleware`: attach normalized trace IDs to context metadata.
- `authBoundaryMiddleware`: reject stale/invalid tenant context before dispatch.
- `retryClassificationMiddleware`: classify retryability; no retries executed here.
- `metricsMiddleware`: emit start/success/failure telemetry.
- `invariantMiddleware`: assert post-conditions and fail closed.

## Short-Circuit Semantics

- Middleware may short-circuit by throwing typed `ServiceError`.
- `authBoundaryMiddleware` MUST run before any DB/RPC dispatch.
- `invariantMiddleware` runs last and may fail after dispatch if response breaks contract.

## Error Propagation Rules

- Preserve typed `ServiceError` codes.
- Wrap unknown errors into `ServiceError` at boundary adapters, not inside each middleware.
- Metrics must record failures regardless of classification.

## Retry Visibility

- Retry classification is emitted before dispatch.
- `operationTraceId` and `requestTraceId` must stay stable across retries.
