import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createLoadCertClient, percentile, resolveTenantId } from "../load-cert/shared.mjs";
import { resolveSupabaseTarget } from "../lib/supabase-target.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATE = process.env.GATE_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const OUT_PATH = path.join(ROOT, "docs", "ops", `staging-load-cert-results-${DATE}.md`);

const STEPS = [
  { name: "bootstrap", script: "load-cert:bootstrap" },
  { name: "seed", script: "load-cert:seed" },
  { name: "verify_seed", script: "load-cert:verify-seed" },
  { name: "billing", script: "load-cert:billing", metrics: true },
  { name: "appointments", script: "load-cert:appointments" },
  { name: "inventory", script: "load-cert:inventory" },
  { name: "notifications_outbox", script: "load-cert:notifications-outbox", metrics: true },
  { name: "concurrent", script: "load-cert:concurrent", metrics: true },
];

function runNpmScript(script) {
  const started = performance.now();
  const result = spawnSync("npm", ["run", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    shell: true,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    elapsedMs: performance.now() - started,
  };
}

function parseSloLines(output) {
  const lines = output.split(/\r?\n/).filter((l) => l.includes("SLO PASS") || l.includes("SLO FAIL"));
  return lines;
}

async function collectInfraMetrics(client, tenantId) {
  const metrics = {};

  const statuses = ["PENDING", "PROCESSING", "RETRY", "FAILED", "DELIVERED", "DEAD_LETTER"];
  for (const status of statuses) {
    const { count } = await client
      .from("event_outbox")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", status);
    metrics[`outbox_${status.toLowerCase()}`] = count ?? 0;
  }

  const { count: deadLetters } = await client
    .from("dead_letter_events")
    .select("*", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  metrics.dead_letter_24h = deadLetters ?? 0;

  const tables = ["patients", "invoices", "notifications"];
  for (const table of tables) {
    const { count } = await client.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
    metrics[table] = count ?? 0;
  }

  for (const [rpc, key] of [
    ["run_billing_reconciliation", "billing"],
    ["run_notification_reconciliation", "notifications"],
  ]) {
    const args =
      rpc === "run_billing_reconciliation"
        ? {
            _tenant_id: tenantId,
            _window_start: new Date(Date.now() - 86_400_000).toISOString(),
            _window_end: new Date(Date.now() + 86_400_000).toISOString(),
            _dry_run: true,
          }
        : {
            p_tenant_id: tenantId,
            p_window_start: new Date(Date.now() - 86_400_000).toISOString(),
            p_window_end: new Date(Date.now() + 86_400_000).toISOString(),
            p_dry_run: true,
          };
    const { data } = await client.rpc(rpc, args);
    metrics[`recon_${key}_critical`] = data?.[0]?.critical_count ?? data?.critical_count ?? 0;
  }

  return metrics;
}

async function main() {
  const target = resolveSupabaseTarget(ROOT);
  const results = [];

  for (const step of STEPS) {
    console.log(`\n=== ${step.name} ===`);
    const run = runNpmScript(step.script);
    const slos = parseSloLines(`${run.stdout}\n${run.stderr}`);
    const pass = run.exitCode === 0;
    results.push({ ...step, pass, elapsedMs: run.elapsedMs, slos, exitCode: run.exitCode });
    if (!pass) {
      console.error(run.stderr || run.stdout);
      break;
    }
  }

  let infra = {};
  try {
    const client = createLoadCertClient();
    const tenantId = await resolveTenantId(client);
    infra = await collectInfraMetrics(client, tenantId);
  } catch (error) {
    infra.error = String(error.message ?? error);
  }

  const overallPass = results.every((r) => r.pass);
  const p95Billing = results.find((r) => r.name === "billing")?.slos.find((l) => l.includes("p95"));
  const p95Concurrent = results.find((r) => r.name === "concurrent")?.slos.find((l) => l.includes("p95"));

  const body = `# Staging Load Certification Results

Date: ${DATE}  
Target: ${target.source} (${target.url ?? "n/a"})  
Operator: automated (\`npm run ops:run-load-game-day\`)

## Summary

| Gate | Result |
|------|--------|
| Volume seed | ${results.find((r) => r.name === "seed")?.pass ? "PASS" : "FAIL/PENDING"} |
| Seed verification | ${results.find((r) => r.name === "verify_seed")?.pass ? "PASS" : "FAIL/PENDING"} |
| Billing payments | ${results.find((r) => r.name === "billing")?.pass ? "PASS" : "FAIL/PENDING"} |
| Appointment bookings | ${results.find((r) => r.name === "appointments")?.pass ? "PASS" : "FAIL/PENDING"} |
| Inventory deductions | ${results.find((r) => r.name === "inventory")?.pass ? "PASS" : "FAIL/PENDING"} |
| Notifications (outbox path) | ${results.find((r) => r.name === "notifications_outbox")?.pass ? "PASS" : "FAIL/PENDING"} |
| Concurrent users (50) | ${results.find((r) => r.name === "concurrent")?.pass ? "PASS" : "FAIL/PENDING"} |
| **Overall load gate** | ${overallPass ? "PASS" : "FAIL"} |

## Volume Counts (post-run)

| Table | Count |
|-------|------:|
| patients | ${infra.patients ?? ""} |
| invoices | ${infra.invoices ?? ""} |
| notifications | ${infra.notifications ?? ""} |

## Latency / SLO

| Step | Elapsed | SLO lines |
|------|--------:|-----------|
${results.map((r) => `| ${r.name} | ${(r.elapsedMs / 1000).toFixed(1)}s | ${r.slos.join("; ") || (r.pass ? "PASS" : "FAIL")} |`).join("\n")}

${p95Billing ? `\nBilling: ${p95Billing}\n` : ""}${p95Concurrent ? `Concurrent: ${p95Concurrent}\n` : ""}

## Infrastructure

| Metric | Value |
|--------|------:|
| outbox_pending | ${infra.outbox_pending ?? ""} |
| outbox_failed | ${infra.outbox_failed ?? ""} |
| outbox_dead_letter | ${infra.outbox_dead_letter ?? ""} |
| dead_letter_24h | ${infra.dead_letter_24h ?? ""} |
| billing_recon_critical | ${infra.recon_billing_critical ?? ""} |
| notification_recon_critical | ${infra.recon_notifications_critical ?? ""} |

## Sign-Off

- [ ] p50/p95/p99 reviewed for billing + concurrent
- [ ] Zero reconciliation critical findings
- [ ] Outbox backlog acceptable
- [ ] Ready for staging sign-off (if local: re-run on staging remote)
`;

  fs.writeFileSync(OUT_PATH, body, "utf8");
  console.log(`\nWrote ${path.relative(ROOT, OUT_PATH)}`);
  if (!overallPass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
