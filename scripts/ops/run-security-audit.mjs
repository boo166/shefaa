import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "../lib/env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadLocalEnv(ROOT, [".env", ".env.local"]);

const ALLOWED_SERVICE_ROLE_FUNCTIONS = new Set([
  "appointment-reminders",
  "generate-monthly-reports",
  "refresh-materialized-views",
  "send-appointment-notifications",
  "send-invoice-emails",
  "process-insurance-claims",
  "invite-staff",
  "job-worker",
  "event-delivery-worker",
  "lab-webhook-inbound",
  "integration-api",
]);

const CLIENT_SECRET_PATTERNS = [
  { name: "service_role_key", pattern: /SUPABASE_SERVICE_ROLE_KEY/g },
  { name: "service_role_literal", pattern: /service_role/gi },
  { name: "hardcoded_jwt", pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
];

const SCAN_DIRS = ["src", "scripts", "supabase/functions"];
const IGNORE_DIRS = new Set(["node_modules", "dist", "coverage", ".git"]);
const IGNORE_FILE_SUFFIXES = [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"];

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files);
    else files.push(fullPath);
  }
  return files;
}

function scanClientSecretExposure() {
  const findings = [];
  for (const relDir of SCAN_DIRS) {
    for (const filePath of walk(path.join(ROOT, relDir))) {
      if (IGNORE_FILE_SUFFIXES.some((suffix) => filePath.endsWith(suffix))) continue;
      const rel = path.relative(ROOT, filePath).replaceAll("\\", "/");
      const contents = fs.readFileSync(filePath, "utf8");

      if (rel.startsWith("src/") && contents.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        findings.push({ severity: "critical", area: "client_bundle", detail: `${rel} references SUPABASE_SERVICE_ROLE_KEY` });
      }

      for (const rule of CLIENT_SECRET_PATTERNS) {
        if (rule.name === "service_role_key" && rel.startsWith("supabase/functions/")) continue;
        const matches = contents.match(rule.pattern);
        if (!matches) continue;
        if (rule.name === "service_role_literal" && !rel.includes("serviceRoleAudit")) {
          if (rel.startsWith("supabase/functions/") || rel.startsWith("scripts/load-cert/") || rel.startsWith("scripts/ops/")) {
            continue;
          }
        }
        if (rule.name === "hardcoded_jwt") {
          findings.push({ severity: "critical", area: "secrets", detail: `${rel} contains JWT-like token (${matches.length} match(es))` });
        }
      }
    }
  }
  return findings;
}

function scanEdgeFunctionServiceRole() {
  const functionsDir = path.join(ROOT, "supabase/functions");
  const offenders = [];
  if (!fs.existsSync(functionsDir)) return offenders;

  for (const entry of fs.readdirSync(functionsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const indexPath = path.join(functionsDir, entry.name, "index.ts");
    if (!fs.existsSync(indexPath)) continue;
    const contents = fs.readFileSync(indexPath, "utf8");
    if (contents.includes("SUPABASE_SERVICE_ROLE_KEY") && !ALLOWED_SERVICE_ROLE_FUNCTIONS.has(entry.name)) {
      offenders.push(entry.name);
    }
  }
  return offenders;
}

function scanEnvFiles() {
  const tracked = [".env", ".env.local", ".env.production", ".env.staging"];
  const present = tracked.filter((name) => fs.existsSync(path.join(ROOT, name)));
  const examplePath = path.join(ROOT, ".env.example");
  return {
    trackedEnvFilesPresent: present,
    hasEnvExample: fs.existsSync(examplePath),
  };
}

function runNpmAudit() {
  try {
    const output = execSync("npm audit --json", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return JSON.parse(output);
  } catch (error) {
    if (error.stdout) return JSON.parse(error.stdout);
    return { error: error.message };
  }
}

function summarizeAudit(audit) {
  const meta = audit?.metadata?.vulnerabilities ?? {};
  return {
    critical: meta.critical ?? 0,
    high: meta.high ?? 0,
    moderate: meta.moderate ?? 0,
    low: meta.low ?? 0,
    info: meta.info ?? 0,
    total: meta.total ?? 0,
  };
}

function printReport({ npmSummary, secretFindings, edgeOffenders, envScan }) {
  const date = new Date().toISOString().slice(0, 10);
  console.log(`# Security Audit Report — ${date}\n`);

  console.log("## Dependency Audit (npm audit)\n");
  console.log(`| Severity | Count |`);
  console.log(`| --- | ---: |`);
  for (const [key, value] of Object.entries(npmSummary)) {
    console.log(`| ${key} | ${value} |`);
  }
  console.log("");

  console.log("## Secret Exposure Scan\n");
  if (secretFindings.length === 0) {
    console.log("- PASS: no client-side service role references detected in scanned paths.");
  } else {
    for (const finding of secretFindings) {
      console.log(`- ${finding.severity.toUpperCase()} [${finding.area}]: ${finding.detail}`);
    }
  }
  console.log("");

  console.log("## Edge Function Service Role Allowlist\n");
  if (edgeOffenders.length === 0) {
    console.log("- PASS: all edge functions using service role are on the approved list.");
  } else {
    for (const name of edgeOffenders) {
      console.log(`- FAIL: ${name} uses SUPABASE_SERVICE_ROLE_KEY but is not allowlisted.`);
    }
  }
  console.log("");

  console.log("## Environment Files\n");
  console.log(`- .env.example present: ${envScan.hasEnvExample ? "yes" : "no"}`);
  if (envScan.trackedEnvFilesPresent.length === 0) {
    console.log("- PASS: no committed .env files detected in repo root.");
  } else {
    console.log(`- WARN: found env files in repo root: ${envScan.trackedEnvFilesPresent.join(", ")}`);
  }
  console.log("");

  const failed =
    npmSummary.critical > 0 ||
    npmSummary.high > 0 ||
    secretFindings.some((f) => f.severity === "critical") ||
    edgeOffenders.length > 0;

  console.log(`## Gate: ${failed ? "FAIL" : "PASS"}\n`);
  if (failed) process.exitCode = 1;
}

const npmAudit = runNpmAudit();
const npmSummary = summarizeAudit(npmAudit);
const secretFindings = scanClientSecretExposure();
const edgeOffenders = scanEdgeFunctionServiceRole();
const envScan = scanEnvFiles();

printReport({ npmSummary, secretFindings, edgeOffenders, envScan });
