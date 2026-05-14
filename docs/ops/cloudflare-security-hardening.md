# Cloudflare Security Hardening Runbook

This runbook defines the Cloudflare posture required before treating Shefaa as an auditable healthcare platform. It is intentionally operational: do not add app-side gateway, queue, or runtime coordination work as part of this checklist.

## TLS

- Set SSL/TLS mode to **Full (strict)**.
- Disable Flexible TLS for all environments.
- Enable automatic HTTPS rewrites.
- Enable HSTS after production certificate validation succeeds.

## Cache Rules

Bypass cache for every authenticated, tenant-scoped, PHI-adjacent, API, or signed URL path:

- `/app/*`
- `/tenant/*`
- `/portal/*`
- `/api/*`
- Supabase project domains and `*.supabase.co/*`
- Signed storage URLs and any URL carrying auth, token, signature, or expiry parameters

Only static frontend assets with content hashes should be cacheable. Never cache HTML shell responses for tenant or portal routes.

## WAF And Bot Rules

Create WAF and rate-limit rules for:

- auth pages and auth callback/reset flows
- invite flows
- `register-clinic`
- `check-slug`
- public captcha-protected onboarding endpoints

Recommended controls:

- bot score challenge or block for clearly automated traffic
- burst protection by IP and ASN for public endpoints
- stricter country/region review rules only when abuse evidence exists
- managed rules for OWASP, credential stuffing, and known bad bots
- logging mode first for new blocks, then enforce after reviewing false positives

## Rate Limit Rules

Edge rate limits should complement, not replace, the Upstash and DB-backed application limits.

- `register-clinic`: low burst limit by IP, higher sustained limit only after captcha passes.
- `check-slug`: moderate burst limit by IP because this endpoint is easy to enumerate.
- invite endpoints: limit by IP and authenticated tenant/admin context where Cloudflare logs support it.
- password reset and auth pages: protect with bot score and burst limits, but do not create rules that lock out legitimate recovery traffic during a Redis or Supabase incident.

## Security Headers

Apply headers at the Cloudflare/hosting layer and keep `scripts/validate-csp.mjs` aligned with production.

- `Content-Security-Policy`: allow only required Supabase, hCaptcha, Sentry, and application asset origins.
- `Strict-Transport-Security`: enable after Full Strict TLS is verified.
- `X-Frame-Options: DENY` or equivalent CSP `frame-ancestors 'none'`, except explicitly approved embedded flows.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `X-Content-Type-Options: nosniff`.
- Avoid headers or worker logs that persist JWTs, signed URLs, PHI, request bodies, or storage object paths containing patient context.

## Logging And Review

- Treat Cloudflare logs as potentially PHI-adjacent because URLs may include tenant slugs and workflow context.
- Redact query strings in exported logs when possible.
- Review WAF events weekly during rollout and daily for the first week after enforcement.
- Capture false-positive decisions in the incident/access-review log.

## Acceptance Checklist

- TLS mode is Full Strict in production.
- Authenticated and PHI-adjacent paths bypass cache.
- Static assets are cached only when content-hashed.
- WAF rules protect auth, invite, registration, and slug-check paths.
- Edge rate limits are active for public abuse paths.
- Security headers are applied and CSP validation passes.
- Cloudflare logging posture avoids JWT, signed URL, and PHI retention.
