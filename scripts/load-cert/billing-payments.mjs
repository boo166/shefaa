import { assertSlo, createLoadCertClient, percentile, resolveActorUserId, resolveTenantId } from "./shared.mjs";

const PAYMENT_COUNT = Number.parseInt(process.env.PAYMENT_COUNT ?? "1000", 10);
const P95_MS = Number.parseInt(process.env.BILLING_P95_MS ?? "500", 10);

async function main() {
  const client = createLoadCertClient();
  const tenantId = await resolveTenantId(client);
  const actorUserId = await resolveActorUserId(client, tenantId);

  const { data: patient } = await client.from("patients").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
  if (!patient?.id) throw new Error("No patient found for billing load cert.");

  const { data: invoice, error: invoiceError } = await client.from("invoices").insert({
    tenant_id: tenantId,
    patient_id: patient.id,
    invoice_code: `LOAD-${Date.now()}`,
    service: "Load certification",
    amount: PAYMENT_COUNT,
    amount_paid: 0,
    balance_due: PAYMENT_COUNT,
    status: "pending",
    invoice_date: new Date().toISOString().slice(0, 10),
  }).select("id").single();

  if (invoiceError || !invoice?.id) throw invoiceError ?? new Error("Failed to seed invoice");

  const latencies = [];
  for (let i = 1; i <= PAYMENT_COUNT; i += 1) {
    const started = performance.now();
    const { data, error } = await client.rpc("post_invoice_payment", {
      p_invoice_id: invoice.id,
      p_tenant_id: tenantId,
      p_amount: 1,
      p_payment_method: "cash",
      p_idempotency_key: `load-cert-pay-${invoice.id}-${i}`,
      p_request_hash: `hash-${i}`,
      p_user_id: actorUserId,
    });
    latencies.push(performance.now() - started);
    if (error || data?.[0]?.result_code !== "OK") {
      throw error ?? new Error(`Payment ${i} failed`);
    }
  }

  const { count } = await client.from("invoice_payments").select("*", { count: "exact", head: true }).eq("invoice_id", invoice.id);
  assertSlo("zero_duplicate_payments", count === PAYMENT_COUNT, `payments=${count}/${PAYMENT_COUNT}`);

  const { data: recon } = await client.rpc("run_billing_reconciliation", {
    _tenant_id: tenantId,
    _window_start: new Date(Date.now() - 86_400_000).toISOString(),
    _window_end: new Date(Date.now() + 86_400_000).toISOString(),
    _dry_run: true,
  });
  const critical = recon?.[0]?.critical_count ?? recon?.critical_count ?? 0;
  assertSlo("reconciliation_clean", Number(critical) === 0, `critical=${critical}`);
  assertSlo("billing_p95_latency", percentile(latencies, 95) <= P95_MS, `p95=${percentile(latencies, 95).toFixed(1)}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
