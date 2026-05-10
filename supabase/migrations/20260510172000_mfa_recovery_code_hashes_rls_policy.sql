-- Explicit deny policy so architecture RLS coverage checks can distinguish
-- "no direct table access" from "RLS enabled without a policy".
drop policy if exists "mfa_recovery_code_hashes_no_direct_access" on public.mfa_recovery_code_hashes;
create policy "mfa_recovery_code_hashes_no_direct_access"
  on public.mfa_recovery_code_hashes
  for all
  to authenticated
  using (false)
  with check (false);
