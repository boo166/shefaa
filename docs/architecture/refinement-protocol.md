# Zero-to-Hero Feature Refinement Protocol

You are refining an existing production SaaS module into an enterprise-grade subsystem.

This is NOT a cosmetic refactor.
This is a full-stack runtime, security, operational, architectural, and UX hardening pass.

You must preserve existing business functionality unless explicitly improving unsafe behavior.

The system is:

* multi-tenant
* Supabase-backed
* Zustand + React Query frontend
* runtime-hardened auth architecture already exists
* strict tenant isolation is mandatory
* fail-closed behavior is preferred
* deterministic orchestration is required

Your task is to refine the target feature/module from:

* functionally working
  to:
* production-grade, resilient, observable, deterministic, and operationally safe.

---

# Required Refinement Areas

You MUST analyze and refine ALL of the following dimensions.

---

# 1. Domain Architecture

Define or refine:

* lifecycle/state machine
* ownership model
* concurrency model
* async workflow model
* invariants
* failure boundaries
* trust boundaries
* authority boundaries

Requirements:

* explicit deterministic state transitions
* invalid transitions rejected
* no implicit mutation chains
* no hidden side effects

Output:

* state diagrams
* lifecycle definitions
* invariant list
* transition rules

---

# 2. Backend / Service Hardening

Refine:

* service orchestration
* repository boundaries
* transactional integrity
* retries/backoff
* idempotency
* deduplication
* replay protection
* stale-write protection
* race-condition handling
* queue/backpressure handling
* timeout handling
* cancellation/abort behavior

Requirements:

* fail closed
* bounded retries only
* deterministic cleanup
* no infinite loops
* no silent partial failure

Add:

* request correlation IDs
* operation trace IDs
* structured service error taxonomy

---

# 3. Authorization & Tenant Isolation

Refine:

* role enforcement
* capability enforcement
* tenant scoping
* stale session handling
* privilege escalation prevention
* SECURITY DEFINER safety
* RPC authorization
* storage isolation
* realtime isolation

Requirements:

* backend authorization mandatory
* frontend checks are UX-only
* all tenant boundaries enforced server-side
* cross-tenant access must fail closed

Add:

* adversarial validation scenarios
* runtime tenant assertions
* stale-context rejection

---

# 4. Database & RLS Review

Analyze:

* RLS policies
* RPC safety
* SECURITY DEFINER usage
* aggregation leakage
* cross-tenant joins
* stale JWT behavior
* entitlement enforcement
* soft-delete behavior
* indexing/performance

Requirements:

* fail closed on missing tenant context
* no parameter-based tenant trust
* no hidden bypass paths
* explicit permission checks

Add:

* pgTAP or SQL adversarial tests
* runtime validation scenarios

---

# 5. Realtime / Async Behavior

Refine:

* websocket lifecycle
* reconnect behavior
* replay handling
* event ordering
* deduplication
* optimistic updates
* drift detection
* stale subscription cleanup
* multi-tab synchronization

Requirements:

* no stale subscriptions after auth/tenant changes
* deterministic reconnect behavior
* bounded retry/backoff
* replay-safe event processing

---

# 6. Observability & Operations

Add:

* metrics
* structured logs
* anomaly detection
* dashboards
* operational alerts
* trace correlation
* incident diagnostics

Requirements:

* no secrets/tokens in logs
* all critical transitions observable
* runtime anomalies measurable

Add:

* operational runbook
* rollout plan
* rollback plan
* kill switch if appropriate

---

# 7. Frontend UX Architecture

Refine:

* async states
* loading states
* degraded states
* stale states
* reconnect states
* authorization states
* tenant visibility
* operational visibility
* destructive workflows
* optimistic reconciliation

Requirements:

* deterministic rendering
* no flicker
* no stale principal rendering
* explicit failure/recovery UX
* capability-aware UI

Add:

* safe-mode UX if relevant
* operational banners
* realtime status indicators
* session-awareness indicators

---

# 8. Design System Compliance

Ensure:

* consistent spacing
* severity system
* alert hierarchy
* accessible focus behavior
* keyboard navigation
* responsive behavior
* modal/dialog consistency
* skeleton/loading consistency

Do not introduce inconsistent UI patterns.

---

# 9. Testing Expansion

You MUST expand:

* unit tests
* integration tests
* adversarial tests
* multi-tab tests
* chaos tests
* soak tests
* stale-context tests
* race-condition tests
* authorization bypass tests
* tenant-isolation tests
* replay/retry tests
* realtime drift tests

Requirements:

* tests prove invariants
* tests simulate failure paths
* tests simulate concurrency
* tests simulate stale sessions

---

# 10. Production Validation

Create:

* staging validation checklist
* runtime invariant checklist
* rollout gates
* observability gates
* rollback criteria
* operational SLOs

---

# 11. Deliverables

You MUST provide:

1. Architectural analysis
2. Risk analysis
3. Threat model
4. Runtime invariant list
5. Refined backend architecture
6. Refined frontend architecture
7. Database/RLS review
8. Observability plan
9. Testing strategy
10. Rollout strategy
11. Concrete implementation plan
12. Prioritized execution phases
13. Exact files/services/components to modify
14. Migration strategy if needed
15. Regression-risk analysis

---

# 12. Non-Negotiable Rules

* Never trust frontend authorization.
* Never trust tenant identifiers from clients.
* Never reuse stale auth/session/tenant context.
* Never allow silent cross-tenant leakage.
* Never introduce infinite retries.
* Never use invalidateQueries() for hard auth boundaries.
* Never log secrets/tokens/session payloads.
* Never leave realtime subscriptions alive across principal changes.
* Never allow partial cleanup after boundary reset.
* Never introduce hidden background side effects.

---

# 13. Output Style

You must:

* think like a principal/staff engineer
* prioritize resilience over convenience
* prioritize deterministic behavior over optimistic assumptions
* prefer fail-closed behavior
* identify architectural weaknesses aggressively
* propose runtime-safe patterns
* identify operational risks
* include concrete implementation details
* include adversarial scenarios
* include production failure analysis

Avoid:

* generic advice
* surface-level UI suggestions
* simplistic CRUD assumptions
* vague “best practices”
* shallow refactor suggestions

The goal is:
enterprise-grade subsystem refinement.
