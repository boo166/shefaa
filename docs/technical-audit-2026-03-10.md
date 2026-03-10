# Technical Audit Report (Lovable + Supabase)

Date: 2026-03-10  
Repo: `shefaa` (Vite/React frontend + Supabase backend)  
Scope: application code in `src/`, Supabase migrations in `supabase/migrations/`, and edge functions in `supabase/functions/`.

## 1. Project Overview

### What The Project Does
Multi-tenant clinic management application. A tenant (clinic) contains staff users with roles (clinic_admin, doctor, nurse, receptionist, accountant, and super_admin) and manages operational and clinical workflows:
- Patients and patient documents (PHI)
- Doctors and schedules
- Appointments and reminders
- Medical records and prescriptions
- Lab orders
- Billing: invoices and insurance claims
- Notifications and audit logging
- Subscription plan metadata per tenant

### Architecture (High Level)
- **Frontend**: Single Page Application (SPA) built with Vite + React + TypeScript; data fetching via Supabase client + React Query; routing via React Router; UI via shadcn/ui + Tailwind.
- **Backend**: Supabase Postgres with Row Level Security (RLS) enforcing tenant isolation and role-based access; business invariants via triggers and security-definer functions.
- **Edge Functions** (Supabase Functions):
  - `register-clinic`: atomic tenant + owner creation using service role.
  - `invite-staff`: staff invite flow using service role + invite code.
  - `check-slug`: slug availability/validation helper.
  - `appointment-reminders`: cron-triggerable reminder delivery with dedupe log.

### Technologies Used
- React 18, TypeScript, Vite 5
- React Router, TanStack React Query, Zustand
- TailwindCSS, shadcn/ui (Radix UI)
- Supabase (Auth, Postgres, RLS, Storage, Edge Functions)
- `pg_cron` + `pg_net` extensions for scheduled jobs (DB-side scheduling)
- Resend (optional) for email delivery in reminders

### Overall System Design Quality (Summary)
Strong direction: tenant isolation via RLS, role model separated from profiles, and edge functions for privileged flows. The recent fixes moved critical trust decisions server-side, which is the right design for a multi-tenant/PHI product.

Main remaining work is “productionization”: controlled deployment pipelines, stronger abuse prevention, and hardening edge function CORS/redirect handling and observability.

## 2. Code Review

### Code Quality
Strengths:
- Clear feature folders (`src/features/*`) and shared modules (`src/shared/*`, `src/core/*`).
- React Query used for caching/data fetching.
- Auth state centralized (`src/core/auth`).

Gaps:
- Many `any` usages across feature pages and utilities. This reduces refactor safety and increases runtime error risk.
- Some components/pages are large and mix UI + data access + transformation.

### Structure / Organization
- Overall structure is reasonable for a SPA. Feature separation is consistent.
- Supabase integration is centralized (`src/integrations/supabase/client.ts` and generated types).

### Maintainability
Recommended improvements:
- Introduce typed data-access modules per domain (patients, appointments, billing) that return DTOs used by components.
- Normalize “role” handling to a single typed shape across app (avoid `user_roles?.[0]` patterns).

### Code Duplication
Observed patterns that tend to duplicate:
- Repeated “fetch list + map to UI rows” logic in feature pages.
- Repeated status badge/render helpers in dashboard-like tables.

Recommendation: consolidate shared formatters and table column builders in `src/shared/`.

### Best Practices Followed / Missing
Followed:
- Separation of privileged operations into edge functions.
- Use of RLS and security-definer helpers (`has_role`, `get_user_tenant_id`).

Missing / weak:
- Stronger runtime input validation on edge functions (e.g., zod-based schemas).
- Durable rate limiting (current in-memory limiters are not reliable at scale).
- CSP/XSS hardening guidance (auth tokens stored in `localStorage`).

## 3. Supabase Review

### Schema Structure (Core Tables)
Key tables (not exhaustive):
- `tenants`, `profiles`, `user_roles`
- `patients`, `patient_documents`, `medical_records`, `prescriptions`
- `doctors`, `doctor_schedules`
- `appointments`, `appointment_reminder_log`
- `invoices`, `insurance_claims`, `lab_orders`
- `notifications`, `notification_preferences`, `user_preferences`
- `subscriptions`
- `audit_logs`
- `user_invites`

### Relationships
- Tenant isolation via `tenant_id` columns across domain tables.
- `profiles.user_id` references `auth.users`.
- `user_roles.user_id` references `auth.users` and now also explicitly references `profiles(user_id)` for integrity and PostgREST embedding.
- Domain references validated by tenant-reference triggers (appointments/records/etc).

### Query Performance & Index Usage
Good improvements already present:
- Indexes added for common FKs (appointments.patient_id, appointments.doctor_id, lab_orders.*, etc).
- Dedupe log uses partial unique indexes per channel.

Remaining performance risks:
- Broad `select("*")` usage in some queries may pull more columns than needed.
- Potential N+1 patterns if joins aren’t used where appropriate.
- Pagination: ensure list endpoints use `.range()` consistently for large tables.

### RLS, Policies, and Tenant Isolation
Strengths:
- Tenant isolation primarily via `tenant_id = get_user_tenant_id(auth.uid())`.
- Role-scoped policies for PHI (medical records, patient docs) and billing (invoices/claims).
- Critical trust decisions moved into `handle_new_user()` trigger: owner elevation and staff joining require server-verifiable conditions (pending owner email or invite code).
- Cross-tenant reference integrity enforced via triggers for key domain tables.

Things to verify continuously:
- Every table that contains tenant-scoped data has RLS enabled.
- Every table has explicit policies for required actions (no accidental permissive defaults).
- Security-definer functions all set a safe `search_path` (they do in current code).

### Storage Configuration
- Bucket: `patient-documents` (private).
- Policies updated to ensure tenant folder alignment (phase 1 hardening migration).

Gap:
- Bucket creation migration is not idempotent (`INSERT INTO storage.buckets ...` without `ON CONFLICT`). This can fail if the bucket was created manually before migrations run.

### Edge Functions
Covered functions:
- `register-clinic`: service-role atomic creation; rolls back tenant on user create failure.
- `invite-staff`: service-role invite; writes `user_invites` and sends invite.
- `check-slug`: helper.
- `appointment-reminders`: protected by `x-cron-secret`; dedupe via `appointment_reminder_log`.

## 4. Security Audit

### Current Posture (After Recent Fixes)
The four previously critical multi-tenant/auth trust issues have been addressed in the backend:
- Tenant joining is restricted to pending owner email (self signup) or a server-issued invite code.
- Owner role elevation happens atomically inside the trigger.
- Signup is now atomic (tenant rollback on user creation failure).
- Cross-tenant reference integrity is enforced by triggers.

### Remaining Security Risks (Most Important)
1. **Edge function CORS is wildcard** (`Access-Control-Allow-Origin: *`) even for privileged endpoints (invite-staff). While JWT is required, tighten origins to reduce attack surface.
2. **Open redirect risk**: `invite-staff` uses the `Origin` header to build `redirectTo`. A malicious caller can spoof this header outside a browser context. Use an allowlist env var (e.g., `APP_ORIGIN`) or validate against known origins.
3. **Abuse prevention / signup hardening**: in-memory rate limiting is not durable and can be bypassed at scale. Consider CAPTCHA (hCaptcha/Turnstile), IP-based throttling at the edge (gateway/WAF), and Supabase auth rate limit configuration.
4. **Token storage**: SPA stores Supabase auth tokens in `localStorage`. This is common but increases impact of XSS. Mitigate with strict CSP, dependency hygiene, and avoiding dangerous HTML injection.
5. **Secrets & scheduling**: reminder cron scheduling requires secure secret handling. Ensure `REMINDER_CRON_SECRET` is set as an Edge Function secret and the DB cron job uses the same secret.

### OWASP Top 10 Mapping (High Level)
- A01 Broken Access Control: largely mitigated via RLS + triggers; keep regression tests.
- A02 Cryptographic Failures: rely on Supabase defaults; ensure HTTPS everywhere; do not store secrets in DB tables without encryption.
- A03 Injection: low in frontend; in edge functions validate JSON inputs; avoid string-built SQL (not used currently).
- A05 Security Misconfiguration: CORS wildcard, missing origin allowlist, lack of production headers.
- A07 Identification and Authentication Failures: ensure email verification policy is intentional; consider MFA for admins.
- A09 Logging and Monitoring Failures: add alerting/telemetry (Sentry, Supabase logs review, audit log dashboards).

## 5. Performance Analysis

### Likely Bottlenecks
- Large table scans if tenant_id filtering is missing in queries or policies.
- List pages without pagination under large tenants.
- Realtime subscriptions if not narrowly filtered (recent narrowing helps).

### Database Optimization
- Keep `tenant_id` indexed on high-cardinality tables.
- Consider composite indexes for common filters (e.g., `(tenant_id, created_at)` for time-ordered lists).
- For reminders: ensure `(status, appointment_date)` queries are supported by indexes if volume grows.

### Caching Strategies
- Frontend: React Query `staleTime` for mostly-static data (roles, preferences).
- Backend: avoid unnecessary joins; return minimal columns.
- Consider server-side caching for read-heavy reporting endpoints (materialized views) if reports become expensive.

## 6. UX Review

Strengths:
- Feature-based navigation and a consistent “dashboard + modules” structure.

Gaps:
- Error states are inconsistent (some return raw backend messages).
- Admin/staff invite flow should clearly show invite sent, pending status, and resend/expire actions.
- Reporting export actions should show progress/spinner and failure reasons.

## 7. Bugs and Issues

Recently addressed:
- PDF export instability: `jspdf-autotable` plugin initialization hardened.
- Profiles/roles embedding instability: explicit FK added to enable PostgREST embedding and prevent orphan role rows.

Areas to watch:
- Any remaining client-side assumptions about role shape (single role vs list).
- Edge function origin/redirect handling.
- Bucket creation idempotency (storage bucket migration).

## 8. Scalability

### Current Scaling Characteristics
- Postgres + RLS scales well for moderate multi-tenant usage.
- Edge functions scale horizontally but in-memory rate limiting does not.

### Bottlenecks
- Reporting queries over large datasets.
- Notification/reminder fan-out.
- Realtime subscriptions over broad channels.

Suggestions:
- Add background processing patterns for heavy jobs (queue table + worker function).
- Use database job logs and dead-letter handling for reminders.
- Implement pagination everywhere and avoid `select("*")`.

## 9. Architecture Quality

Modularity and separation of concerns are acceptable, but some UI pages are doing too much. The backend has improved significantly by centralizing trust decisions in the DB trigger and using server-side invites.

Pattern usage:
- React Query for data caching.
- RLS + security-definer helpers for authorization.
- Triggers for invariants (tenant reference validation).

## 10. Improvement Recommendations

### Security
- Restrict edge function CORS origins; add `APP_ORIGIN` allowlist and validate `Origin`.
- Replace in-memory rate limiting with a durable approach (WAF/gateway rules, Upstash/Redis, or Supabase rate limits + CAPTCHA for signup).
- Add CSP headers (at hosting layer) and audit for XSS sinks.
- Ensure secrets are only in Supabase Secrets (never in git). Rotate anything that was ever committed.

### Supabase / Data
- Make storage bucket creation idempotent (new migration that safely creates bucket if missing, and adjust manual steps accordingly).
- Add regression tests for RLS (use `supabase test db` / SQL test harness) to prevent future bypasses.
- Consider a `profiles.role` cached column/view if role joins become hot paths.

### Performance
- Add pagination/range on all list queries.
- Add composite indexes for `(tenant_id, created_at)` on large tables used in ordered views.
- For reminders: add index on `(status, appointment_date)` if volume grows.

### UX
- Standardize error handling with user-friendly messages and correlation IDs.
- Improve invite UI with “pending/accepted/expired” statuses (backed by `user_invites`).

## 11. Final Report

### Overall Rating (Out of 10)
7.5 / 10

Reasoning: core multi-tenant security and integrity are now solid, but production readiness still needs stronger abuse prevention, edge function origin hardening, and deployment/observability maturity.

### Top 10 Critical Issues (Now)
1. Edge function `Origin`-based `redirectTo` without allowlist (open redirect risk).
2. CORS wildcard on privileged edge functions (tighten).
3. Non-durable rate limiting for signup/invites (abuse risk).
4. SPA token storage in `localStorage` without documented CSP/XSS hardening.
5. Reminder scheduling depends on consistent secret handling; risk of misconfiguration.
6. Storage bucket creation migration not idempotent (can break deployments).
7. Lack of automated RLS regression tests (high risk of future bypass regressions).
8. Observability gap: limited error reporting/alerting.
9. Large/`any`-heavy UI code reduces reliability and increases regression risk.
10. Reporting scalability not addressed (likely to be first performance pain point).

### Top 10 Improvement Recommendations
1. Add `APP_ORIGIN` allowlist validation and remove wildcard CORS for privileged functions.
2. Add CAPTCHA + durable rate limiting for `register-clinic` and `invite-staff`.
3. Add RLS regression test suite (SQL tests) and run in CI.
4. Add Sentry (or equivalent) + structured logs for edge functions.
5. Add safe, explicit reminder scheduling runbook and automation.
6. Introduce pagination everywhere and avoid `select("*")` where unnecessary.
7. Add composite indexes on `(tenant_id, created_at)` for high-traffic tables.
8. Standardize role handling to a single typed model in frontend.
9. Reduce `any` usage in core auth/admin flows; add types for Supabase DTOs.
10. Add environment separation (dev/stage/prod) + migration pipeline and drift checks.

