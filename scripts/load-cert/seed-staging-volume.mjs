import { createLoadCertClient, resolveTenantId } from "./shared.mjs";

const PATIENT_COUNT = Number.parseInt(process.env.PATIENT_COUNT ?? "100000", 10);
const INVOICE_COUNT = Number.parseInt(process.env.INVOICE_COUNT ?? "100000", 10);
const NOTIFICATION_COUNT = Number.parseInt(process.env.NOTIFICATION_COUNT ?? "1000000", 10);
const BATCH_SIZE = Number.parseInt(process.env.SEED_BATCH_SIZE ?? "500", 10);
const PREFIX = process.env.SEED_PREFIX ?? "LOAD-CERT";

const ONLY = new Set(
  (process.env.SEED_ONLY ?? "")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean),
);

function shouldSeed(target) {
  return ONLY.size === 0 || ONLY.has(target);
}

async function insertInBatches(client, table, rows, label) {
  if (rows.length === 0) return;
  const started = performance.now();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await client.from(table).insert(batch);
    if (error) throw error;
    if ((i + BATCH_SIZE) % 10_000 === 0 || i + BATCH_SIZE >= rows.length) {
      console.log(`${label}: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
    }
  }
  console.log(`${label} done in ${((performance.now() - started) / 1000).toFixed(1)}s`);
}

async function countForTenant(client, table, tenantId) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return count ?? 0;
}

async function resolveNotificationUserId(client, tenantId) {
  if (process.env.NOTIFICATION_USER_ID) return process.env.NOTIFICATION_USER_ID;
  const { data, error } = await client
    .from("profiles")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  if (error || !data?.user_id) throw new Error("Missing profile user for notification seeding.");
  return data.user_id;
}

async function seedPatients(client, tenantId) {
  const existing = await countForTenant(client, "patients", tenantId);
  const needed = Math.max(0, PATIENT_COUNT - existing);
  if (needed === 0) {
    console.log(`patients: already at ${existing}, skipping`);
    return;
  }

  const rows = [];
  for (let i = 0; i < needed; i += 1) {
    const index = existing + i + 1;
    rows.push({
      tenant_id: tenantId,
      patient_code: `${PREFIX}-PT-${String(index).padStart(8, "0")}`,
      full_name: `${PREFIX} Patient ${index}`,
      status: "active",
      gender: index % 2 === 0 ? "female" : "male",
      date_of_birth: `19${70 + (index % 30)}-${String((index % 12) + 1).padStart(2, "0")}-15`,
    });
  }

  await insertInBatches(client, "patients", rows, `patients (+${needed})`);
}

async function seedInvoices(client, tenantId) {
  const existing = await countForTenant(client, "invoices", tenantId);
  const needed = Math.max(0, INVOICE_COUNT - existing);
  if (needed === 0) {
    console.log(`invoices: already at ${existing}, skipping`);
    return;
  }

  const { data: patients, error: patientsError } = await client
    .from("patients")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true })
    .limit(Math.max(needed, 1));
  if (patientsError) throw patientsError;
  if (!patients?.length) throw new Error("No patients available for invoice seeding.");

  const rows = [];
  for (let i = 0; i < needed; i += 1) {
    const index = existing + i + 1;
    const patient = patients[i % patients.length];
    rows.push({
      tenant_id: tenantId,
      patient_id: patient.id,
      invoice_code: `${PREFIX}-INV-${String(index).padStart(8, "0")}`,
      service: `${PREFIX} consultation`,
      amount: 100 + (index % 50),
      amount_paid: 0,
      balance_due: 100 + (index % 50),
      status: "pending",
      invoice_date: new Date(Date.now() - (index % 365) * 86_400_000).toISOString().slice(0, 10),
    });
  }

  await insertInBatches(client, "invoices", rows, `invoices (+${needed})`);
}

async function seedNotifications(client, tenantId) {
  const existing = await countForTenant(client, "notifications", tenantId);
  const needed = Math.max(0, NOTIFICATION_COUNT - existing);
  if (needed === 0) {
    console.log(`notifications: already at ${existing}, skipping`);
    return;
  }

  const userId = await resolveNotificationUserId(client, tenantId);
  const rows = [];
  for (let i = 0; i < needed; i += 1) {
    const index = existing + i + 1;
    rows.push({
      tenant_id: tenantId,
      user_id: userId,
      title: `${PREFIX} notification ${index}`,
      body: JSON.stringify({ index, source: "seed-staging-volume" }),
      type: "system_event",
      read: index % 5 === 0,
    });
  }

  await insertInBatches(client, "notifications", rows, `notifications (+${needed})`);
}

async function main() {
  const client = createLoadCertClient();
  const tenantId = await resolveTenantId(client);

  console.log(`Seeding tenant=${tenantId}`);
  console.log(`Targets: patients=${PATIENT_COUNT} invoices=${INVOICE_COUNT} notifications=${NOTIFICATION_COUNT}`);

  if (shouldSeed("patients")) await seedPatients(client, tenantId);
  if (shouldSeed("invoices")) await seedInvoices(client, tenantId);
  if (shouldSeed("notifications")) await seedNotifications(client, tenantId);

  const [patients, invoices, notifications] = await Promise.all([
    countForTenant(client, "patients", tenantId),
    countForTenant(client, "invoices", tenantId),
    countForTenant(client, "notifications", tenantId),
  ]);

  console.log(`Final counts: patients=${patients} invoices=${invoices} notifications=${notifications}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
