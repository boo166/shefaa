import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "../lib/env.mjs";
import { resolveSupabaseTarget } from "../lib/supabase-target.mjs";
import { runPsqlFile } from "../lib/run-psql.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATE = process.env.GATE_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const DOCS = path.join(ROOT, "docs", "ops");

loadLocalEnv(ROOT, [".env", ".env.local"]);

function run(command, options = {}) {
  try {
    return execSync(command, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
  } catch (error) {
    return error.stdout ?? error.stderr ?? error.message;
  }
}

function writeReport(filename, content) {
  const filePath = path.join(DOCS, filename);
  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Wrote ${path.relative(ROOT, filePath)}`);
  return filePath;
}

function parseSecurityAudit(output) {
  const critical = Number(output.match(/\| critical \| (\d+) \|/)?.[1] ?? 0);
  const high = Number(output.match(/\| high \| (\d+) \|/)?.[1] ?? 0);
  const gate = output.includes("## Gate: PASS") ? "PASS" : "FAIL";
  const secretsPass = output.includes("no client-side service role references");
  const edgePass = output.includes("all edge functions using service role are on the approved list");
  const envWarn = output.includes("WARN: found env files");
  return { critical, high, gate, secretsPass, edgePass, envWarn, raw: output };
}

function tryRlsReport() {
  const target = resolveSupabaseTarget();
  const dbUrl = target.dbUrl ?? process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;
  if (!dbUrl && target.source !== "local") {
    return { status: "SKIPPED", reason: "No DB URL (start local Supabase or set SUPABASE_DB_URL)", output: "" };
  }

  const sqlPath = path.join(ROOT, "scripts", "ops", "rls-coverage-report.sql");
  try {
    const output = runPsqlFile(sqlPath, ROOT);
    const tablesWithoutPolicies = Number(output.match(/tables_without_policies\s*\|\s*(\d+)/)?.[1] ?? -1);
    const rlsDisabled = Number(output.match(/rls_disabled_tables\s*\|\s*(\d+)/)?.[1] ?? -1);
    const pass = tablesWithoutPolicies === 0 && rlsDisabled === 0;
    return { status: pass ? "PASS" : "FAIL", tablesWithoutPolicies, rlsDisabled, output };
  } catch (error) {
    return { status: "SKIPPED", reason: String(error.message ?? error), output: "" };
  }
}

function tryLoadCertProbe() {
  const target = resolveSupabaseTarget();
  if (!target.url || !target.serviceRoleKey) {
    return {
      status: "BLOCKED",
      source: target.source,
      reason:
        target.source === "local"
          ? "Local Supabase not running — run `supabase start`"
          : "Missing SUPABASE_SERVICE_ROLE_KEY in .env",
    };
  }
  return { status: "READY", source: target.source, url: target.url };
}

function buildSecurityReport(audit) {
  return `# Security Audit Results

Date: ${DATE}  
Operator: automated (\`npm run ops:generate-gates\`)

## Summary

| Gate | Result |
|------|--------|
| Dependency audit (\`npm audit\`) | ${audit.gate === "PASS" && audit.critical === 0 && audit.high === 0 ? "PASS" : "FAIL"} |
| Secret exposure scan | ${audit.secretsPass ? "PASS" : "FAIL"} |
| Edge function service role allowlist | ${audit.edgePass ? "PASS" : "FAIL"} |
| RLS coverage report | PENDING — run \`psql\` with DB URL |
| **Overall security gate** | ${audit.gate === "PASS" && audit.critical === 0 && audit.high === 0 && audit.secretsPass && audit.edgePass ? "PASS" : "FAIL"} |

## Dependency Audit

\`\`\`bash
npm run ops:security-audit
\`\`\`

| Severity | Count |
|----------|------:|
| critical | ${audit.critical} |
| high | ${audit.high} |

<details>
<summary>Full audit output</summary>

\`\`\`
${audit.raw.trim()}
\`\`\`

</details>

## Secret Exposure

| Check | Result |
|-------|--------|
| No service role in \`src/\` | ${audit.secretsPass ? "PASS" : "FAIL"} |
| Edge functions on allowlist | ${audit.edgePass ? "PASS" : "FAIL"} |
| Committed \`.env\` files | ${audit.envWarn ? "WARN" : "PASS"} |

## RLS Coverage

Run on staging:

\`\`\`bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/ops/rls-coverage-report.sql
\`\`\`

## Remediation Required

${audit.critical + audit.high > 0 ? `- Address ${audit.critical} critical and ${audit.high} high npm vulnerabilities before certification.\n` : "- No critical dependency blockers beyond recorded audit.\n"}
${audit.envWarn ? "- Ensure `.env` is gitignored and not committed.\n" : ""}

## Sign-Off

- [ ] Zero critical/high npm vulnerabilities (or documented exceptions)
- [ ] RLS report run on staging with zero sensitive-table gaps
- [ ] Ready to proceed to Phase 3 (DR Drill)
`;
}

function buildLoadReport(probe) {
  return `# Staging Load Certification Results

Date: ${DATE}  
Operator:  
Target: **${probe.source ?? "unknown"}** — ${probe.url ?? "not configured"}  
Tenant ID: ${process.env.TENANT_ID ?? "(auto-resolve)"}

## Summary

| Gate | Result | Notes |
|------|--------|-------|
| Volume seed | PENDING | Run \`npm run load-cert:seed\` |
| Billing payments | PENDING | Run \`npm run load-cert:billing\` |
| Notification deliveries | PENDING | Run \`npm run load-cert:notifications\` |
| Appointment bookings | PENDING | Run \`npm run load-cert:appointments\` |
| Inventory deductions | PENDING | Run \`npm run load-cert:inventory\` |
| Concurrent users (50) | PENDING | Run \`npm run load-cert:concurrent\` |
| **Overall load gate** | PENDING | |

## Environment Status

- Target: ${probe.source ?? "unknown"} (${probe.url ?? "not configured"})
- Credentials: ${probe.status}
${probe.reason ? `- Note: ${probe.reason}` : "- Run: `npm run load-cert:game-day`"}

## Volume Seed

| Table | Target | Actual | Duration |
|-------|-------:|-------:|---------:|
| patients | 100,000 | | |
| invoices | 100,000 | | |
| notifications | 1,000,000 | | |

## Latency Metrics

| Script | p50 (ms) | p95 (ms) | p99 (ms) | Throughput |
|--------|---------:|---------:|---------:|------------|
| billing-payments | | | | |
| notification-deliveries | | | | |
| concurrent-users | | | | |

## Reconciliation (dry run, post-load)

| Domain | Critical | Warning | Info |
|--------|---------:|--------:|-----:|
| Billing | | | |
| Notifications | | | |
| Appointments | | | |

## Sign-Off

- [ ] Engineering reviewed slow queries
- [ ] Indexes verified or migration filed
- [ ] Ready to proceed to Phase 2 (Security Audit)
`;
}

function buildDrReport() {
  return `# Disaster Recovery Drill Results

Date: ${DATE}  
Operator:  
Reviewer:  
Target environment: staging-restore / ephemeral

## Summary

| Stage | Result |
|-------|--------|
| Backup artifact validation | PENDING |
| Database restore | PENDING |
| \`backup-smoke.sql\` | PENDING |
| Reconciliation dry run | PENDING |
| Application smoke | PENDING |
| Tenant isolation manual check | PENDING |
| **Overall DR gate** | PENDING |

## Drill Procedure

Follow [backup-restore-validation-checklist.md](./backup-restore-validation-checklist.md):

\`\`\`text
Backup
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

## Sign-Off

- [ ] Engineering sign-off
- [ ] Operations sign-off
- [ ] Ready to proceed to Phase 4 (UAT)
`;
}

function buildUatReport() {
  return `# User Acceptance Testing Results

Date: ${DATE}  
Environment: staging

## Summary

| Role | Tester | Result | Blockers |
|------|--------|--------|----------|
| Receptionist | | PENDING | |
| Doctor | | PENDING | |
| Accountant | | PENDING | |
| Pharmacist | | PENDING | |
| Lab Technician | | PENDING | |
| **Overall UAT gate** | | PENDING | |

## Checklists

- [receptionist.md](./uat/day-in-the-life/receptionist.md)
- [doctor.md](./uat/day-in-the-life/doctor.md)
- [accountant.md](./uat/day-in-the-life/accountant.md)
- [pharmacist.md](./uat/day-in-the-life/pharmacist.md)
- [lab-technician.md](./uat/day-in-the-life/lab-technician.md)

## Evidence

- [ ] Screenshots per role
- [ ] Runtime Ops reconciliation critical = 0 after accountant + pharmacist flows
- [ ] No developer intervention during any role session
`;
}

const securityOutput = run("node scripts/ops/run-security-audit.mjs");
const audit = parseSecurityAudit(securityOutput);
const probe = tryLoadCertProbe();

writeReport(`security-audit-${DATE}.md`, buildSecurityReport(audit));
writeReport(`staging-load-cert-results-${DATE}.md`, buildLoadReport(probe));
writeReport(`dr-drill-${DATE}.md`, buildDrReport());
writeReport(`uat-results-${DATE}.md`, buildUatReport());

const rls = tryRlsReport();
if (rls.status !== "SKIPPED") {
  const rlsPath = path.join(DOCS, `rls-report-${DATE}.txt`);
  fs.writeFileSync(rlsPath, rls.output, "utf8");
  console.log(`Wrote ${path.relative(ROOT, rlsPath)} (${rls.status})`);
} else {
  console.log(`RLS report skipped: ${rls.reason}`);
}

console.log("\nGate reports generated. Next: npm run load-cert:game-day on staging.");
