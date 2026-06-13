# MFA security model (MedFlow / Shefaa)

This document defines how multi-factor authentication (MFA) is modeled in the product: trust levels, factors, enforcement surfaces, telemetry, and known platform limits (Supabase Auth).

## Goals

- MFA is a **governed assurance subsystem**, not a one-time OTP prompt.
- **MFA required** for: `super_admin`, `clinic_admin`, `doctor`, `accountant`, `pharmacist`, `lab_technician` (see `MFA_REQUIRED_ROLES` in `authStore.ts`).
- **Optional** for: `receptionist`, `nurse`.
- **Login-time MFA** is required when the user has at least one **verified** MFA factor but the current session’s authenticator assurance is below **AAL2** (see Supabase `getAuthenticatorAssuranceLevel`).

## Assurance semantics

| Concept | Meaning |
|--------|---------|
| `authenticated` (app) | Valid Supabase session and clinic profile loaded; user may still be **AAL1** if MFA is enrolled but not yet satisfied this session. |
| `mfa_required` / `mfa_verifying` (state machine) | Session is authenticated at the app layer but **MFA proof is pending** before entering fully trusted navigation. |
| **AAL1** | Password (or equivalent) only; JWT / session is not MFA-satisfied. |
| **AAL2** | MFA satisfied per Supabase (e.g. TOTP verified for this session). |

**Invariant:** Privileged routes that require MFA continue to rely on **Supabase AAL** and verified factors (`privilegedSession` / `PrivilegedMfaPanel` patterns). Non-privileged users use the same TOTP enrollment and login challenge flow.

## Allowed factors (Phase 1)

- **TOTP** (primary), via Supabase Auth MFA enrollment.
- **Recovery codes** (backup): stored app-side as **hashed** one-time values; consumed via `SECURITY DEFINER` RPCs. See **Recovery codes and JWT AAL** below.
- **Not in Phase 1:** SMS, email OTP fallback, WebAuthn (planned later).

## Actions vs MFA (Phase 1)

| Surface | MFA expectation |
|--------|------------------|
| Login | If user has verified MFA factor and session is AAL1 → **`mfa_required`** → `/mfa` challenge. |
| Normal clinic routes | Allowed after login + MFA challenge when applicable. |
| Privileged (super admin / clinic admin) routes | Existing **AAL2 + enrollment** gates remain (`ProtectedRoute` → `/security/privileged` as today). |
| Step-up for billing / exports / impersonation | **Deferred** (Phase 2); not enforced in Phase 1. |

## Telemetry (auth metrics)

Emit via `emitAuthMetric` (see `src/services/auth/authMetrics.ts`):

| Event | When |
|-------|------|
| `mfa_challenge_required` | Login detected enrolled MFA but session not AAL2. |
| `mfa_challenge_succeeded` | Challenge succeeded and app returned to `authenticated` (payload may include `method`: `totp` / `recovery`). |
| `mfa_challenge_failed` | Challenge failed (wrong code, RPC error, etc.). |
| `mfa_enroll_started` | User started TOTP enrollment (QR / secret issued). |
| `mfa_enroll_succeeded` | TOTP factor verified and active. |
| `mfa_enroll_failed` | Enrollment or verify failed. |
| `recovery_codes_generated` | User generated a new set of recovery codes (replaces unused pool). |
| `recovery_code_used` | A recovery code was successfully consumed at login. |

**Suggested future:** `mfa_bypass_attempt`, `step_up_required`, `trusted_device_granted`, `suspicious_device_detected` (Phase 3+).

## Session version and stale context

`sessionVersion` is derived from:

- Stable **principal** (user id + effective tenant id + session creation anchor from Supabase user/session metadata).
- **Assurance tag** derived from current **AAL** (`0` = unknown/none, `1` = aal1, `2` = aal2).

When assurance changes (e.g. password login → MFA verify), `sessionVersion` **bumps**, so `captureAuthContextSnapshot` / `withAuthStaleGuard` reject stale async work.  
`AuthContextSnapshot` also records `assuranceLevel` explicitly (see `authContextSnapshot.ts`).

## Recovery codes and JWT AAL

Supabase Auth’s JWT **AAL claim** is updated when the user completes **`auth.mfa.verify`** for a TOTP (or other supported) factor. **Consuming an app-managed recovery code does not automatically raise Supabase JWT AAL to AAL2.**

**Production policy (Option B):**

- Recovery codes **unlock login** (dashboard access) with **AAL1** JWT and session version tag `1`.
- **Privileged actions** (staff invite, admin RPCs, privileged routes) still require **TOTP → AAL2**.
- Custom Access Token Hook (Option A) is deferred post-go-live.

## Recovery orchestration

- MFA challenge is **not** an HTTP 401 refresh loop: do not route `mfa_required` through `runAuthRecovery` / token refresh storms.
- Password reauth (`ReauthDialog`) remains separate from MFA challenge.

## Database / RLS

- Recovery code **hashes** live in `public.mfa_recovery_code_hashes` (see migration). Direct table access is not granted to `anon` / `authenticated`; only **`SECURITY DEFINER` RPCs** mutate or return plaintext codes (generation returns plaintext **once**).
- Future: `assert_mfa_verified()` style RPCs for sensitive operations should align with tenant policy and JWT/hook strategy.

## References (code)

- Auth state machine: `src/services/auth/authStateMachine.ts`
- Auth store / login MFA: `src/core/auth/authStore.ts`
- Login challenge UI: `src/pages/MfaPage.tsx`
- Stale context: `src/services/auth/authContextSnapshot.ts`
- Session version: `src/services/auth/sessionVersion.ts`
- MFA enrollment UI (all users + privileged): `src/features/auth/PrivilegedMfaPanel.tsx` (embedded in `SecurityTab` and privileged security page)
