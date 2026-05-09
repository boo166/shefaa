# ADR-001: Auth boundary model

- **Status:** accepted  
- **Date:** 2026-05-09  

## Context

The app requires deterministic session orchestration across HTTP 401/403, refresh storms, and safe mode.

## Decision

Centralize HTTP auth handling in `createSupabaseAuthFetch`, session orchestration in `authSessionOrchestrator`, and state transitions in `authStateMachine`. Kill switch via `VITE_AUTH_KILL_SWITCH`.

## Consequences

- **(+)**: Predictable recovery; metrics hooks (`emitAuthMetric`).  
- **(-)**: All Supabase traffic should use the wrapped client; bypass requires ADR.  
- **Follow-up:** Document step-up MFA in a dedicated ADR when expanded.
