# RPC authorization standard

## Rules

1. Every `SECURITY DEFINER` function must validate:
   - Caller identity
   - Tenant scope (match JWT claims / session tenant)
   - Role/capability equivalent on server
2. **Never** accept tenant id as sole proof—pair with membership check.
3. Return structured result codes for billing commands (idempotency replay, retryable).

## Client

- Use repositories; attach trace payload where supported.
- `evaluateAuthorize` before optimistic UI; server remains authoritative.

## Testing

- SQL tests for negative cases (wrong tenant, revoked role).
- Staging tests for stale JWT behavior.
