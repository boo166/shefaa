import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATE = process.env.GATE_REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const OUT_PATH = path.join(ROOT, "docs", "ops", `security-audit-triage-${DATE}.md`);

function runNpmAudit() {
  try {
    return JSON.parse(execSync("npm audit --json", { cwd: ROOT, encoding: "utf8" }));
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    throw error;
  }
}

function loadPackageSets() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return {
    prod: new Set(Object.keys(pkg.dependencies ?? {})),
    dev: new Set(Object.keys(pkg.devDependencies ?? {})),
  };
}

function isReachable(name, pkgSets, entry) {
  if (pkgSets.dev.has(name)) return "no";
  if (pkgSets.prod.has(name)) return "yes";
  if ((entry.effects ?? []).some((e) => pkgSets.prod.has(e))) return "transitive-prod";
  return "no";
}

function collectVulnerabilities(audit) {
  const rows = [];
  const pkgSets = loadPackageSets();
  const vulnerabilities = audit.vulnerabilities ?? {};

  for (const [name, entry] of Object.entries(vulnerabilities)) {
    const via = entry.via ?? [];
    const advisories = via.filter((v) => typeof v === "object");
    const severity = entry.severity ?? advisories[0]?.severity ?? "unknown";
    const fixAvailable = entry.fixAvailable === true || (typeof entry.fixAvailable === "object" && entry.fixAvailable !== null);
    const reachable = isReachable(name, pkgSets, entry);

    if (advisories.length === 0) {
      rows.push({
        package: name,
        severity,
        reachable,
        fixAvailable: fixAvailable ? "yes" : "no",
        mitigation: fixAvailable ? "npm audit fix / upgrade" : "manual review",
        decision:
          (severity === "critical" || severity === "high") &&
          (reachable === "yes" || reachable === "transitive-prod")
            ? "REMEDIATE"
            : severity === "critical" || severity === "high"
              ? "DOCUMENT"
              : "ACCEPT",
        title: entry.name ?? name,
        range: entry.range ?? "",
      });
      continue;
    }

    for (const adv of advisories) {
      rows.push({
        package: name,
        severity: adv.severity ?? severity,
        reachable,
        fixAvailable: fixAvailable ? "yes" : "no",
        mitigation: adv.url ? `[advisory](${adv.url})` : "manual review",
        decision:
          (adv.severity === "critical" || adv.severity === "high") &&
          (reachable === "yes" || reachable === "transitive-prod")
            ? "REMEDIATE"
            : adv.severity === "critical" || adv.severity === "high"
              ? "DOCUMENT"
              : "ACCEPT",
        title: adv.title ?? name,
        range: entry.range ?? adv.range ?? "",
      });
    }
  }

  const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4, unknown: 5 };
  return rows.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
}

function buildReport(audit, rows) {
  const meta = audit.metadata?.vulnerabilities ?? {};
  const openCritical = rows.filter((r) => r.severity === "critical" && r.decision === "REMEDIATE").length;
  const openHigh = rows.filter((r) => r.severity === "high" && r.decision === "REMEDIATE").length;
  const devOnly = rows.filter((r) => (r.severity === "critical" || r.severity === "high") && r.decision === "DOCUMENT").length;
  const gate = openCritical === 0 && openHigh === 0 ? "PASS" : "FAIL";

  let body = `# Security Audit Triage

Date: ${DATE}  
Source: \`npm audit --json\`  
Gate: **${gate}**

## Summary

| Severity | Count |
|----------|------:|
| critical | ${meta.critical ?? 0} |
| high | ${meta.high ?? 0} |
| moderate | ${meta.moderate ?? 0} |
| low | ${meta.low ?? 0} |
| **total** | ${meta.total ?? 0} |

Remediation required before production: **${openCritical} critical**, **${openHigh} high** (reachable).  
Dev-only / transitive documented: **${devOnly}**.

## Triage Matrix

| Package | Severity | Reachable? | Fix available? | Mitigation | Decision |
|---------|----------|------------|----------------|------------|----------|
`;

  for (const row of rows) {
    body += `| ${row.package} | ${row.severity} | ${row.reachable} | ${row.fixAvailable} | ${row.mitigation} | ${row.decision} |\n`;
  }

  body += `
## Remediation Plan

| Priority | Action | Owner | Status |
|----------|--------|-------|--------|
| P0 | Resolve all REMEDIATE critical/high reachable packages | Engineering | PENDING |
| P1 | Run \`npm audit fix\` and re-run triage | Engineering | PENDING |
| P2 | Document ACCEPT/DOCUMENT exceptions with ADR | Security | PENDING |

## Sign-Off

- [ ] Zero reachable critical vulnerabilities
- [ ] Zero reachable high vulnerabilities (or documented exception)
- [ ] \`npm run ops:security-audit\` secrets/edge gate PASS
- [ ] RLS report run on target environment
`;

  return body;
}

const audit = runNpmAudit();
const rows = collectVulnerabilities(audit);
fs.writeFileSync(OUT_PATH, buildReport(audit, rows), "utf8");
console.log(`Wrote ${path.relative(ROOT, OUT_PATH)} (${rows.length} entries)`);
if (rows.some((r) => r.decision === "REMEDIATE")) process.exitCode = 1;
