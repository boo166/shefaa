import { runPsqlSql } from "../lib/run-psql.mjs";
import { createLoadCertClient, resolveTenantId } from "./shared.mjs";
import { resolveSupabaseTarget } from "../lib/supabase-target.mjs";

const TENANT_ID = process.env.TENANT_ID;
const USER_ID = process.env.LOAD_CERT_USER_ID ?? "b1000000-0000-0000-0000-000000000001";
const PROFILE_ID = process.env.LOAD_CERT_PROFILE_ID ?? "b2000000-0000-0000-0000-000000000001";
const DOCTOR_ID = process.env.LOAD_CERT_DOCTOR_ID ?? "b3000000-0000-0000-0000-000000000001";
const PATIENT_ID = process.env.LOAD_CERT_PATIENT_ID ?? "b4000000-0000-0000-0000-000000000001";
const MEDICATION_ID = process.env.LOAD_CERT_MEDICATION_ID ?? "b5000000-0000-0000-0000-000000000001";
const BATCH_ID = process.env.LOAD_CERT_BATCH_ID ?? "b6000000-0000-0000-0000-000000000001";

function runSql(sql) {
  runPsqlSql(sql);
}

async function ensurePublicFixtures(client, tenantId) {
  const { count: patientCount } = await client
    .from("patients")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if ((patientCount ?? 0) > 0) {
    console.log(`Fixtures already present for tenant ${tenantId} (patients=${patientCount})`);
    return;
  }

  const target = resolveSupabaseTarget();
  if (!target.dbUrl && !process.env.DOCKER_HOST) {
    throw new Error("DB URL or Docker required for fixture bootstrap. Start local Supabase.");
  }

  console.log(`Bootstrapping load-cert fixtures for tenant ${tenantId}`);

  runSql(
    `SET session_replication_role = replica; insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', '${USER_ID}', 'authenticated', 'authenticated', 'load-cert@local.test', '', now(), jsonb_build_object('tenant_id', '${tenantId}'), jsonb_build_object('tenant_id', '${tenantId}', 'full_name', 'Load Cert User'), now(), now()) on conflict (id) do nothing; SET session_replication_role = DEFAULT;`,
  );

  runSql(
    `insert into public.profiles (id, user_id, tenant_id, full_name)
     values ('${PROFILE_ID}', '${USER_ID}', '${tenantId}', 'Load Cert User')
     on conflict (id) do nothing`,
  );

  runSql(
    `insert into public.user_roles (id, user_id, role)
     values ('b7000000-0000-0000-0000-000000000001', '${USER_ID}', 'clinic_admin')
     on conflict (id) do nothing`,
  );

  const { error: doctorError } = await client.from("doctors").upsert({
    id: DOCTOR_ID,
    tenant_id: tenantId,
    full_name: "Dr Load Cert",
    specialty: "General",
    status: "available",
  });
  if (doctorError) throw doctorError;

  const { error: patientError } = await client.from("patients").upsert({
    id: PATIENT_ID,
    tenant_id: tenantId,
    patient_code: "LOAD-CERT-SEED",
    full_name: "Load Cert Seed Patient",
    status: "active",
  });
  if (patientError) throw patientError;

  const { error: medicationError } = await client.from("medications").upsert({
    id: MEDICATION_ID,
    tenant_id: tenantId,
    name: "Load Cert Medication",
    stock: 10_000,
    unit: "tablets",
    status: "in_stock",
  });
  if (medicationError) throw medicationError;

  const { error: batchError } = await client.from("medication_batches").upsert({
    id: BATCH_ID,
    tenant_id: tenantId,
    medication_id: MEDICATION_ID,
    lot_number: "LOAD-CERT-B1",
    quantity: 10_000,
    expiry_date: "2030-12-31",
  });
  if (batchError) throw batchError;

  console.log("Load-cert fixtures ready.");
}

async function main() {
  const client = createLoadCertClient();
  const tenantId = TENANT_ID ?? (await resolveTenantId(client));
  await ensurePublicFixtures(client, tenantId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
