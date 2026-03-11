# Policy Coverage Checklist

Use this checklist whenever adding a new table or storage bucket to ensure tenant isolation and RLS coverage stay complete.

## Table Checklist
- [ ] `tenant_id` (or `user_id`) column is present and enforced by foreign key.
- [ ] Row Level Security is enabled on the table.
- [ ] `SELECT` policy is defined and tenant/user scoped.
- [ ] `INSERT` policy is defined and tenant/user scoped with `WITH CHECK`.
- [ ] `UPDATE` policy is defined and tenant/user scoped with `USING` + `WITH CHECK`.
- [ ] `DELETE` policy is explicitly defined, or intentionally denied (document why).
- [ ] Service-role or security-definer access is defined (if server-side writes are required).
- [ ] Indexes exist on `tenant_id` and critical query fields (dates/status/FKs).
- [ ] pgTAP policy tests added in `supabase/tests`.

## Storage Bucket Checklist
- [ ] Bucket created with correct `public` flag and file constraints.
- [ ] `SELECT` policy scoped to tenant path (or explicit public access).
- [ ] `INSERT` policy scoped to tenant path.
- [ ] `UPDATE` policy scoped to tenant path (if supported).
- [ ] `DELETE` policy scoped to tenant path.
- [ ] Integration tests cover cross-tenant access attempts.

## Documentation
- [ ] Table/bucket added to the latest RLS review document.
- [ ] Security or compliance impact noted (PHI/PII, retention, audit).
