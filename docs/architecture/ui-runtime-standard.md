# UI runtime standard

## Operational shell

- **Tenant / role / AAL** visible in-session (`SessionBoundaryBadge`).
- **Global strip:** `RuntimeStatusLayer` for auth machine states (refreshing, MFA, reauth, errors).
- **Ops incident:** optional `IncidentBannerSlot` when `VITE_INCIDENT_BANNER` is set.
- **Stale data:** optional `StaleDataBanner` driven by React Query `isStale` or domain logic.
- **Degraded auth states** surface non-blocking indicators (impersonation, non-`authenticated` machine state).

## Async UX

- Prefer explicit states over generic spinners for long operations.
- Show trace reference for support on hard failures when available.

## Capability-driven navigation

- Nav items filter by permission today; migrate labels to capability ids in refinement waves.

## Accessibility

- Badges use `title` for full text; responsive hiding with `md:flex` where space constrained.
