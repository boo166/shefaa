# Runtime invariants standard

## Definition

An **invariant** is a condition that must always hold across state transitions. Violations indicate corruption, auth drift, or a bypass.

## Implementation

- **API:** `assertRuntimeInvariant({ domain, invariant, expected, actual, message? })` in `src/platform/runtime/invariants.ts`.
- **Behavior:**
  - **Development / tests:** throw immediately.
  - **Production:** warn + optional metric via `subscribeRuntimeInvariantViolations`.
- **UI:** `assertUiInvariant` for client-only boundary checks (`src/platform/runtime/uiInvariants.ts`).

## Required for each domain module

1. List invariants in the feature refinement doc.
2. Map each to a test (unit, integration, or chaos).
3. For financial / PHI domains: at least one invariant checked on read path (defense in depth).

## Examples

| Domain | Invariant | Check |
|--------|-----------|-------|
| Billing | `invoice_tenant_match` | Row `tenant_id` === operation tenant |
| Realtime | `channel_principal_matches` | Channel key includes `sessionVersion` |
| Tenant | `effective_tenant_context` | Super-admin has override before tenant RPC |
