import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPsqlFile } from "../lib/run-psql.mjs";
import { resolveSupabaseTarget } from "../lib/supabase-target.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATE = process.env.GATE_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const OUT_PATH = path.join(ROOT, "docs", "ops", `dr-drill-${DATE}.md`);

function runStep(name, fn) {
  const started = Date.now();
  try {
    const result = fn();
    return { name, status: "PASS", durationMs: Date.now() - started, detail: result ?? "" };
  } catch (error) {
    return { name, status: "FAIL", durationMs: Date.now() - started, detail: String(error.message ?? error) };
  }
}

async function main() {
  const target = resolveSupabaseTarget(ROOT);
  const drillStarted = new Date().toISOString();
  const steps = [];

  steps.push(
    runStep("backup_smoke_sql", () => {
      const output = runPsqlFile(path.join(ROOT, "scripts", "backup-smoke.sql"), ROOT);
      return output?.slice(0, 200) || "backup-smoke.sql completed";
    }),
  );

  if (target.dbUrl || target.source === "local") {
    steps.push(
      runStep("rls_coverage_report", () => {
        const output = runPsqlFile(path.join(ROOT, "scripts", "ops", "rls-coverage-report.sql"), ROOT);
        const tablesWithoutPolicies = Number(output.match(/tables_without_policies\s*\|\s*(\d+)/)?.[1] ?? -1);
        const rlsDisabled = Number(output.match(/rls_disabled_tables\s*\|\s*(\d+)/)?.[1] ?? -1);
        if (tablesWithoutPolicies !== 0 || rlsDisabled !== 0) {
          throw new Error(`RLS gaps: tables_without_policies=${tablesWithoutPolicies} rls_disabled=${rlsDisabled}`);
        }
        return `tables_without_policies=0 rls_disabled=0`;
      }),
    );
  }

  const allPass = steps.every((s) => s.status === "PASS");
  const rpo = "15 minutes (Supabase automated backup target — verify on staging project)";
  const rto = steps.reduce((sum, s) => sum + s.durationMs, 0);
  const rtoHuman = `${(rto / 1000).toFixed(1)}s (local smoke subset; full restore drill pending on staging)`;

  const body = `# Disaster Recovery Drill Results

Date: ${DATE}  
Environment: ${target.source} (${target.url ?? "n/a"})  
Operator: automated (\`npm run ops:dr-drill\`)

## Summary

| Stage | Result |
|-------|--------|
| Backup artifact validation | PENDING (staging full backup) |
| Database restore | PENDING (staging isolated restore) |
| \`backup-smoke.sql\` | ${steps.find((s) => s.name === "backup_smoke_sql")?.status ?? "PENDING"} |
| RLS coverage post-restore | ${steps.find((s) => s.name === "rls_coverage_report")?.status ?? "SKIPPED"} |
| Reconciliation dry run | PENDING |
| Application smoke | PENDING |
| Tenant isolation manual | PENDING |
| **Overall DR gate** | ${allPass ? "PARTIAL PASS (local smoke)" : "FAIL"} |

## RPO / RTO

| Metric | Value | Notes |
|--------|-------|-------|
| RPO | ${rpo} | |
| RTO (smoke subset) | ${rtoHuman} | Full staging drill still required |

## Executed Steps (local)

| Step | Status | Duration | Detail |
|------|--------|----------|--------|
${steps.map((s) => `| ${s.name} | ${s.status} | ${s.durationMs}ms | ${s.detail.replace(/\|/g, "/").slice(0, 80)} |`).join("\n")}

## Full Staging Drill (required for sign-off)

\`\`\`text
Backup (Supabase dashboard / pg_dump)
  ↓
Destroy isolated target DB
  ↓
Restore
  ↓
psql -f scripts/backup-smoke.sql
  ↓
run_billing_reconciliation (dry_run)
run_notification_reconciliation (dry_run)
  ↓
Login smoke (clinic admin × 2 tenants)
  ↓
Sign-off
\`\`\`

Drill started: ${drillStarted}

## Sign-Off

- [ ] Engineering sign-off
- [ ] Operations sign-off
- [ ] RPO/RTO recorded from real restore
`;

  fs.writeFileSync(OUT_PATH, body, "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
  if (!allPass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
