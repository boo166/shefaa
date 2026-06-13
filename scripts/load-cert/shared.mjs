import { createClient } from "@supabase/supabase-js";

import { assertSupabaseTarget, resolveSupabaseTarget } from "../lib/supabase-target.mjs";

export function getSupabaseTarget() {
  const target = resolveSupabaseTarget();
  assertSupabaseTarget(target);
  return target;
}

export function createLoadCertClient() {
  const target = getSupabaseTarget();
  return createClient(target.url, target.serviceRoleKey);
}

export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

export function assertSlo(name, pass, detail) {
  if (!pass) {
    console.error(`SLO FAIL: ${name} — ${detail}`);
    process.exitCode = 1;
    return;
  }
  console.log(`SLO PASS: ${name} — ${detail}`);
}

export async function resolveTenantId(client) {
  if (process.env.TENANT_ID) return process.env.TENANT_ID;
  const { data, error } = await client.from("tenants").select("id").limit(1).maybeSingle();
  if (error || !data?.id) throw new Error("Unable to resolve TENANT_ID.");
  return data.id;
}

export async function resolveActorUserId(client, tenantId) {
  if (process.env.LOAD_CERT_USER_ID) return process.env.LOAD_CERT_USER_ID;
  const { data, error } = await client
    .from("profiles")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error || !data?.user_id) {
    throw new Error("No profile user for load cert. Run `npm run load-cert:bootstrap` first.");
  }
  return data.user_id;
}
