# Repository Certification Checklist

Each repository must satisfy these before marked certified in the registry.

## Required Controls

- [ ] Tenant-bound access path
- [ ] Trace-aware context propagation
- [ ] Abort-aware dispatch behavior
- [ ] Stale-context rejection before write dispatch
- [ ] Metrics emitted (`repository_access_start/success/failure`)
- [ ] Retry classification applied from operation class
- [ ] Required capabilities declared
- [ ] `repository.describe()` metadata present
- [ ] Boundary integrity test coverage
- [ ] Runtime policy middleware integrated (shadow mode at minimum)

## `repository.describe()` shape

```ts
{
  certified: boolean,
  tenantBound: boolean,
  retryAware: boolean,
  staleContextSafe: boolean,
  metricsEnabled: boolean,
  requiredCapabilities: string[],
}
```
