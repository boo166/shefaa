import { assertSlo, createLoadCertClient, resolveTenantId } from "./shared.mjs";

const PATIENT_COUNT = Number.parseInt(process.env.PATIENT_COUNT ?? "100000", 10);
const INVOICE_COUNT = Number.parseInt(process.env.INVOICE_COUNT ?? "100000", 10);
const NOTIFICATION_COUNT = Number.parseInt(process.env.NOTIFICATION_COUNT ?? "1000000", 10);
const APPOINTMENT_COUNT = Number.parseInt(process.env.APPOINTMENT_COUNT ?? "0", 10);
const MEDICATION_COUNT = Number.parseInt(process.env.MEDICATION_COUNT ?? "1", 10);

async function countForTenant(client, table, tenantId) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw error;
  return count ?? 0;
}

async function main() {
  const client = createLoadCertClient();
  const tenantId = await resolveTenantId(client);

  const [patients, invoices, notifications, appointments, medications] = await Promise.all([
    countForTenant(client, "patients", tenantId),
    countForTenant(client, "invoices", tenantId),
    countForTenant(client, "notifications", tenantId),
    countForTenant(client, "appointments", tenantId),
    countForTenant(client, "medications", tenantId),
  ]);

  console.log("Seed verification report");
  console.log(`tenant=${tenantId}`);
  console.log("");
  console.log("| table | actual | target | status |");
  console.log("| --- | ---: | ---: | --- |");

  const checks = [
    ["patients", patients, PATIENT_COUNT],
    ["invoices", invoices, INVOICE_COUNT],
    ["notifications", notifications, NOTIFICATION_COUNT],
    ["appointments", appointments, APPOINTMENT_COUNT],
    ["medications", medications, MEDICATION_COUNT],
  ];

  for (const [table, actual, target] of checks) {
    if (target <= 0) {
      console.log(`| ${table} | ${actual} | (skip) | SKIP |`);
      continue;
    }
    const pass = actual >= target;
    assertSlo(`seed_${table}`, pass, `actual=${actual} target=${target}`);
    console.log(`| ${table} | ${actual} | ${target} | ${pass ? "PASS" : "FAIL"} |`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
