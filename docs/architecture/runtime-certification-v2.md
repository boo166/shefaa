# Runtime Certification v2

Repository convergence was the first certification boundary. Runtime Certification v2 certifies **behavioral convergence**: the platform kernels (capability, policy, workflow) are the only authorities that decide runtime behavior.

## Certification dimensions

### 1) Capability kernel
- **Capability graph** exists and is validated (inheritance + constraints).
- **Assurance-aware**: sensitive capabilities require AAL (e.g. `aal2`).
- **Contextual constraints**: tenant status/tier/environment/time windows are supported.
- **Telemetry**: denials emit structured events (see taxonomy below).

### 2) Runtime policy kernel
- **Policy resolver** exists (`resolveRuntimePolicy`) and is the sole place that decides:
  - write gates
  - timeout budgets
  - retry policies
  - replay policies
  - degradation strategies
  - audit levels
- **Shadow-first rollout** supported (`evaluate -> emit -> observe -> enforce`).
- **Runtime modes** are **remote-authoritative** and versioned.
- **Subsystem freezes** supported (selective containment).

### 3) Workflow kernel
- Workflows are **stateful runtime entities**:
  - `workflowId`, `workflowTraceId`, `workflowVersion`
  - checkpointing
  - compensation choreography
  - resume strategies
- Telemetry and decision logging exist for workflow failures and compensation triggers.

### 4) Data plane enforcement
- `platformRepository` middleware order is deterministic:
  - `trace -> authBoundary -> capabilityEnforcement -> runtimePolicy -> retryClassification -> metrics -> invariants`
- Capability + policy enforcement occur at the **boundary**, not inside feature code.

### 5) RPC contract enforcement
- RPC calls can carry `policyContext` envelopes.
- Pilot RPC/server validator exists for:
  - capability
  - assurance
  - tenant scope
  - runtime policy gates

## Structured telemetry taxonomy

Metrics and runtime analytics must follow:

`category.action.result`

Examples:
- `repository.access.start`
- `repository.access.success`
- `repository.access.failure`
- `policy.capability_denied`
- `policy.assurance_requirement_failed`
- `policy.runtime_blocked`
- `runtime.mode_transition`
- `workflow.compensation_triggered`

## Runtime decision logs

When runtime policy blocks behavior, record *why* (for ops explainability):
- denied writes
- assurance failures
- replay rejection
- containment overrides

