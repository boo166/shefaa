# Module certification

Governance tiers for subsystems. Promotion requires evidence in tests and docs.

| Tier | Meaning |
|------|---------|
| Experimental | No certification gates |
| Hardened | Invariants + capability checks + traces |
| Production Critical | Above + chaos scenarios + rollback runbook |
| Financial Critical | Above + ledger/idempotency proofs + reconciliation |

## Requirement matrix

| Requirement | Experimental | Hardened | Production Critical | Financial Critical |
|-------------|----------------|----------|---------------------|-------------------|
| Runtime invariants | Optional | Required | Required | Required |
| Chaos coverage | No | Recommended | Required | Required |
| Capability enforcement | Partial | Required | Required | Required |
| Trace correlation | Partial | Required | Required | Required |
| Replay protection | No | Partial | Required | Required |
| Tenant isolation | RLS | RLS + client gateway | + asserts | + financial asserts |
| Rollback plan | No | Doc | Tested | Game-day |

## Process

1. Owner fills row in [platform-registry.md](./platform-registry.md).
2. Architecture review checks matrix + ADRs.
3. Tier bump merges only from `hardened/` branches or tagged releases.
4. Repository-level certification must include `repository.describe()` metadata and checklist evidence from [repository-certification-checklist.md](./repository-certification-checklist.md).

## Runtime Certification v2 (behavioral)

Repository certification is the entry gate. Runtime Certification v2 certifies **behavioral convergence**: capability, policy, and workflow kernels are the only authorities for runtime behavior.

See: [runtime-certification-v2.md](./runtime-certification-v2.md)
