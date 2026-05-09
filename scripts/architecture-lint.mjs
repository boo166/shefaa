#!/usr/bin/env node
/**
 * Architecture-as-code: forbidden patterns outside approved layers.
 * @see docs/architecture/no-unsafe-paths-policy.md
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");

const ALLOW_SUPABASE_FROM = [
  path.join("src", "services"),
  path.join("src", "integrations", "supabase"),
  path.join("src", "platform", "data"),
];

const DISALLOW_LOCALSTORAGE_TOP = [
  path.join("src", "features"),
  path.join("src", "pages"),
];

const PROTECTED_MODULE_PATHS = [
  "src/services/billing/",
  "src/services/reports/",
  "src/services/auth/",
  "src/services/patients/",
  "src/services/admin/",
];

const BASELINE_FILE = path.join("docs", "architecture", "runtime-enforcement-baseline.md");
const FULL_ENFORCEMENT_FAIL = process.env.ARCH_ENFORCEMENT_STAGE === "D";

function* walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === "coverage") continue;
      yield* walkFiles(full, acc);
    } else if (/\.(ts|tsx|mts|cts)$/.test(name)) {
      yield full;
    }
  }
}

function normalizeRel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function isUnderAllowedSupabaseFrom(rel) {
  return ALLOW_SUPABASE_FROM.some((prefix) => rel.replace(/\\/g, "/").startsWith(prefix.replace(/\\/g, "/")));
}

function mentionsSupabaseFrom(content) {
  return /\bsupabase\s*\.\s*from\s*\(/m.test(content);
}

function mentionsSupabaseRpc(content) {
  return /\bsupabase\s*\.\s*rpc\s*\(/m.test(content);
}

function isProtectedModule(rel) {
  const norm = rel.replace(/\\/g, "/");
  return PROTECTED_MODULE_PATHS.some((p) => norm.startsWith(p));
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Set();
  const lines = fs.readFileSync(BASELINE_FILE, "utf8").split(/\r?\n/);
  const set = new Set();
  for (const line of lines) {
    if (line.startsWith("- ")) set.add(line.slice(2).trim());
  }
  return set;
}

function main() {
  const errors = [];
  const inventory = [];
  const baseline = readBaseline();

  for (const file of walkFiles(srcRoot)) {
    const rel = normalizeRel(file);
    const content = fs.readFileSync(file, "utf8");

    const hasFrom = mentionsSupabaseFrom(content);
    const hasRpc = mentionsSupabaseRpc(content);
    const normRel = rel.replace(/\\/g, "/");
    const hasRawSupabase = hasFrom || hasRpc;

    // Stage D: no raw supabase usage anywhere (outside platform data + supabase adapter layers).
    if (FULL_ENFORCEMENT_FAIL && hasRawSupabase) {
      const allowed = normRel.startsWith("src/services/supabase/") || normRel.startsWith("src/platform/data/");
      if (!allowed) {
        inventory.push(normRel);
        if (!baseline.has(normRel)) {
          errors.push(`${rel}: Stage D forbids raw supabase.* (must use platformRepository)`);
        }
      }
    }

    // Stage C baseline diff: only track unsafe paths (raw usage outside approved layers).
    if (!FULL_ENFORCEMENT_FAIL && hasRawSupabase && !isUnderAllowedSupabaseFrom(rel)) {
      inventory.push(normRel);
      errors.push(`${rel}: supabase.from(...) must live under src/services or src/integrations/supabase`);
    }

    // Stage B: protected modules must not use raw supabase APIs at all
    // (except src/platform/data or src/services/supabase), unless explicitly baselined.
    const norm = rel.replace(/\\/g, "/");
    const inPlatformData = norm.startsWith("src/platform/data/");
    const inSupabaseServices = norm.startsWith("src/services/supabase/");
    if (hasRawSupabase && isProtectedModule(rel) && !inPlatformData && !inSupabaseServices && !baseline.has(norm)) {
      errors.push(`${rel}: protected module must use platformRepository (raw supabase.* forbidden)`);
    }

    const posixRel = rel.replace(/\\/g, "/");
    if (DISALLOW_LOCALSTORAGE_TOP.some((p) => posixRel.startsWith(p.replace(/\\/g, "/")))) {
      if (/\blocalStorage\s*\./m.test(content)) {
        errors.push(`${rel}: localStorage access must go through platform storage helpers (not in features/pages)`);
      }
    }

  }

  const newViolations = inventory.filter((p) => !baseline.has(p));
  if (newViolations.length > 0) {
    errors.push(
      `new unsafe paths detected (baseline-diff): ${newViolations.join(", ")}`,
    );
  }

  console.log("Architecture inventory (raw supabase usage):");
  for (const item of inventory.sort()) {
    console.log(` - ${item}`);
  }

  if (errors.length) {
    console.error("Architecture lint failed:\n\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("Architecture lint OK");
}

main();
