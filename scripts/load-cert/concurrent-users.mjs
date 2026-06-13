import { assertSlo, createLoadCertClient, percentile, resolveTenantId } from "./shared.mjs";

const CONCURRENT_USERS = Number.parseInt(process.env.CONCURRENT_USERS ?? "50", 10);
const OPS_PER_USER = Number.parseInt(process.env.OPS_PER_USER ?? "20", 10);
const P95_MS = Number.parseInt(process.env.CONCURRENT_P95_MS ?? "2000", 10);
const ERROR_BUDGET_PCT = Number.parseInt(process.env.CONCURRENT_ERROR_BUDGET_PCT ?? "1", 10);

async function runUserSession(client, tenantId, userIndex) {
  const latencies = [];
  let errors = 0;

  for (let op = 0; op < OPS_PER_USER; op += 1) {
    const started = performance.now();
    const selector = (userIndex + op) % 5;

    try {
      if (selector === 0) {
        const { error } = await client
          .from("patients")
          .select("id, full_name, patient_code")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
      } else if (selector === 1) {
        const { error } = await client
          .from("appointments")
          .select("id, status, appointment_date")
          .eq("tenant_id", tenantId)
          .order("appointment_date", { ascending: false })
          .limit(25);
        if (error) throw error;
      } else if (selector === 2) {
        const { error } = await client
          .from("invoices")
          .select("id, invoice_code, status, balance_due")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(25);
        if (error) throw error;
      } else if (selector === 3) {
        const { error } = await client
          .from("notifications")
          .select("id, title, read")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(25);
        if (error) throw error;
      } else {
        const { data: patient, error: patientError } = await client
          .from("patients")
          .select("id")
          .eq("tenant_id", tenantId)
          .limit(1)
          .maybeSingle();
        if (patientError) throw patientError;
        if (patient?.id) {
          const { error } = await client
            .from("invoices")
            .select("id, invoice_code, status")
            .eq("tenant_id", tenantId)
            .eq("patient_id", patient.id)
            .limit(10);
          if (error) throw error;
        }
      }
    } catch {
      errors += 1;
    }

    latencies.push(performance.now() - started);
  }

  return { latencies, errors };
}

async function main() {
  const client = createLoadCertClient();
  const tenantId = await resolveTenantId(client);

  console.log(`Concurrent load: users=${CONCURRENT_USERS} ops/user=${OPS_PER_USER} tenant=${tenantId}`);

  const started = performance.now();
  const sessions = await Promise.all(
    Array.from({ length: CONCURRENT_USERS }, (_, index) => runUserSession(client, tenantId, index)),
  );
  const elapsedMs = performance.now() - started;

  const allLatencies = sessions.flatMap((session) => session.latencies);
  const totalErrors = sessions.reduce((sum, session) => sum + session.errors, 0);
  const totalOps = CONCURRENT_USERS * OPS_PER_USER;
  const errorRate = (totalErrors / totalOps) * 100;

  assertSlo(
    "concurrent_error_budget",
    errorRate <= ERROR_BUDGET_PCT,
    `errors=${totalErrors}/${totalOps} (${errorRate.toFixed(2)}%)`,
  );
  assertSlo(
    "concurrent_p95_latency",
    percentile(allLatencies, 95) <= P95_MS,
    `p95=${percentile(allLatencies, 95).toFixed(1)}ms p50=${percentile(allLatencies, 50).toFixed(1)}ms`,
  );
  assertSlo(
    "concurrent_total_duration",
    elapsedMs < Number(process.env.CONCURRENT_MAX_MS ?? "300000"),
    `elapsed=${elapsedMs.toFixed(0)}ms throughput=${(totalOps / (elapsedMs / 1000)).toFixed(1)} ops/s`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
