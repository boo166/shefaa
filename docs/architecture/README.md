# Platform architecture

This directory is the **engineering constitution**: standards, registry, ADRs, and refinement protocols.

## Start here

| Document | Purpose |
|----------|---------|
| [refinement-protocol.md](./refinement-protocol.md) | Zero-to-hero module refinement checklist |
| [platform-registry.md](./platform-registry.md) | Primitives, modules, owners, maturity, risks |
| [no-unsafe-paths-policy.md](./no-unsafe-paths-policy.md) | Mandatory primitives; CI enforcement |
| [runtime-maturity-scoring.md](./runtime-maturity-scoring.md) | Grades `A`–`D` and rollout gates |

## Standards (cross-cutting)

- [runtime-invariants-standard.md](./runtime-invariants-standard.md)
- [multi-tenant-isolation-standard.md](./multi-tenant-isolation-standard.md)
- [state-machine-standard.md](./state-machine-standard.md)
- [observability-standard.md](./observability-standard.md)
- [failure-handling-standard.md](./failure-handling-standard.md)
- [rpc-authorization-standard.md](./rpc-authorization-standard.md)
- [realtime-lifecycle-standard.md](./realtime-lifecycle-standard.md)
- [ui-runtime-standard.md](./ui-runtime-standard.md)

## Feature refinement overlays

- [features/authorization-rbac-refinement.md](./features/authorization-rbac-refinement.md)
- [features/billing-refinement.md](./features/billing-refinement.md)
- [features/realtime-refinement.md](./features/realtime-refinement.md)

## Governance artifacts

- [primitive-adoption-matrix.md](./primitive-adoption-matrix.md)
- [platform-primitive-inventory.md](./platform-primitive-inventory.md)
- [platform-primitives-roadmap.md](./platform-primitives-roadmap.md)
- [failure-containment-model.md](./failure-containment-model.md)
- [module-certification.md](./module-certification.md)
- [platform-middleware-standard.md](./platform-middleware-standard.md)
- [adr/](./adr/) — Architecture Decision Records

## Code entry points

- Authorization: [`src/platform/authorization/`](../../src/platform/authorization/)
- Runtime invariants: [`src/platform/runtime/invariants.ts`](../../src/platform/runtime/invariants.ts)
- Trace IDs: [`src/platform/observability/traceContext.ts`](../../src/platform/observability/traceContext.ts)
- Platform SDK: [`src/platform/sdk.ts`](../../src/platform/sdk.ts)
- Data gateway: [`src/platform/data/platformRepository.ts`](../../src/platform/data/platformRepository.ts)
- Architecture CI: [`scripts/architecture-lint.mjs`](../../scripts/architecture-lint.mjs)
