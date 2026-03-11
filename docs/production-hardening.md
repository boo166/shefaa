# Production Security Headers

Apply these headers at your hosting layer (CDN / reverse proxy). Adjust domains to match your deployment.

## Content-Security-Policy (CSP)
Start with a strict baseline and explicitly allow only what the SPA needs:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://<your-project>.supabase.co wss://<your-project>.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'
```

Notes:
- If you use external analytics or error reporting, add their domains to `connect-src` and `script-src`.
- If you serve images from storage/CDN, add the storage domain to `img-src`.
- Prefer `nonce`-based CSP for inline scripts when possible. The current SPA uses a module script tag, so you can keep `script-src 'self'` if you avoid inline script blocks.

## Other Recommended Headers

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-site
```

## Edge Function Origin Allowlist
Set `APP_ORIGINS` (comma-separated) in Supabase Edge Function secrets to restrict CORS:

```
APP_ORIGINS=https://app.example.com,https://staging.example.com
```
