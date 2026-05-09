# ADR-002: Single-flight recovery

- **Status:** accepted  
- **Date:** 2026-05-09  

## Context

Concurrent 401s can trigger refresh stampedes and inconsistent UI.

## Decision

Use a single-flight recovery queue in the auth service layer; coalesce refresh attempts and serialize boundary resets.

## Consequences

- **(+)**: Stable session under burst errors.  
- **(-)**: Must avoid `invalidateQueries` for hard auth boundaries (per refinement protocol).  
- **Follow-up:** Load-test refresh behavior in staging.
