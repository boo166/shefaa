#!/usr/bin/env node
/**
 * Architecture-as-code: convergence gates for platform-only infrastructure access.
 * @see docs/architecture/no-unsafe-paths-policy.md
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const BASELINE_FILE = path.join("docs", "architecture", "runtime-enforcement-baseline.md");

const CATEGORIES = {
  rawSupabase: "raw-supabase",
  runtimeInternals: "runtime-internal-imports",
  traceGeneration: "direct-trace-generation",
  rawRealtime: "raw-realtime-access",
  rawPolicy: "raw-policy-reads",
  missingCertification: "missing-certification-metadata",
};

const CATEGORY_LABELS = {
  [CATEGORIES.rawSupabase]: "Raw Supabase usage",
  [CATEGORIES.runtimeInternals]: "Runtime internal imports",
  [CATEGORIES.traceGeneration]: "Direct trace generation",
  [CATEGORIES.rawRealtime]: "Raw realtime access",
  [CATEGORIES.rawPolicy]: "Raw runtime policy reads",
  [CATEGORIES.missingCertification]: "Missing certification metadata",
};

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "dist" || name === "coverage") continue;
      yield* walkFiles(full);
    } else if (/\.(ts|tsx|mts|cts)$/.test(name)) {
      yield full;
    }
  }
}

function normalizeRel(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function normPath(value) {
  return value.replace(/\\/g, "/").trim();
}

function isTestFile(rel) {
  return /(^|\/)(__tests__|tests)\//.test(rel) || /\.(test|spec)\.(ts|tsx|mts|cts)$/.test(rel);
}

function readBaseline() {
  const baseline = new Map(Object.values(CATEGORIES).map((category) => [category, new Set()]));
  if (!fs.existsSync(BASELINE_FILE)) return baseline;

  let currentCategory = CATEGORIES.rawSupabase;
  const lines = fs.readFileSync(BASELINE_FILE, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const normalized = heading[1].toLowerCase();
      currentCategory =
        normalized.includes("supabase") ? CATEGORIES.rawSupabase
          : normalized.includes("runtime internal") ? CATEGORIES.runtimeInternals
            : normalized.includes("trace") ? CATEGORIES.traceGeneration
              : normalized.includes("realtime") ? CATEGORIES.rawRealtime
                : normalized.includes("policy") ? CATEGORIES.rawPolicy
                  : normalized.includes("certification") ? CATEGORIES.missingCertification
                    : currentCategory;
      continue;
    }
    if (line.startsWith("- ")) {
      baseline.get(currentCategory)?.add(normPath(line.slice(2)));
    }
  }
  return baseline;
}

function isBaselined(baseline, category, rel) {
  return baseline.get(category)?.has(rel) ?? false;
}

function addViolation(inventory, category, rel) {
  inventory.get(category)?.add(rel);
}

function hasRawSupabase(content) {
  return /\bsupabase\s*\.\s*(from|rpc|channel|removeChannel|auth)\b/m.test(content);
}

function hasRuntimeInternalImport(content) {
  return /from\s+["']@\/platform\/runtime\/(coordination|mode|recovery|policy)(\/[^"']*)?["']/m.test(content);
}

function hasDirectTraceGeneration(content) {
  return /from\s+["']@\/platform\/observability\/traceContext["']/m.test(content)
    && /\b(newRequestTraceId|newRuntimeTransitionTraceId|buildTracePayload)\b/m.test(content);
}

function hasRawRealtimeAccess(content) {
  return /from\s+["']@\/platform\/realtime\/realtimeRuntime["']/m.test(content);
}

function hasRawPolicyRead(content) {
  return /from\s+["']@\/platform\/runtime\/policy(\/[^"']*)?["']/m.test(content)
    && /\bresolveRuntimePolicy\b/m.test(content);
}

function hasRepositoryExport(content) {
  return /export\s+(const|class)\s+\w*Repository\b/m.test(content)
    || /export\s+interface\s+\w*Repository\b/m.test(content);
}

function hasDescribeMetadata(content) {
  return /\bdescribe\s*\(\)\s*\{/m.test(content);
}

function isAllowedRawSupabase(rel) {
  return rel.startsWith("src/services/supabase/")
    || rel.startsWith("src/integrations/supabase/")
    || rel.startsWith("src/platform/data/");
}

function isFeatureBoundary(rel) {
  return rel.startsWith("src/features/")
    || rel.startsWith("src/pages/")
    || rel.startsWith("src/components/")
    || rel.startsWith("src/hooks/");
}

function main() {
  const baseline = readBaseline();
  const inventory = new Map(Object.values(CATEGORIES).map((category) => [category, new Set()]));
  const errors = [];

  for (const file of walkFiles(srcRoot)) {
    const rel = normalizeRel(file);
    const content = fs.readFileSync(file, "utf8");
    const testFile = isTestFile(rel);

    if (!testFile && hasRawSupabase(content) && !isAllowedRawSupabase(rel)) {
      addViolation(inventory, CATEGORIES.rawSupabase, rel);
    }

    if (!testFile && isFeatureBoundary(rel) && hasRuntimeInternalImport(content)) {
      addViolation(inventory, CATEGORIES.runtimeInternals, rel);
    }

    if (!testFile && hasDirectTraceGeneration(content) && !rel.startsWith("src/platform/")) {
      addViolation(inventory, CATEGORIES.traceGeneration, rel);
    }

    if (!testFile && hasRawRealtimeAccess(content) && !rel.startsWith("src/platform/")) {
      addViolation(inventory, CATEGORIES.rawRealtime, rel);
    }

    if (!testFile && hasRawPolicyRead(content) && !rel.startsWith("src/platform/")) {
      addViolation(inventory, CATEGORIES.rawPolicy, rel);
    }

    if (
      !testFile
      && rel.startsWith("src/services/")
      && rel.endsWith(".repository.ts")
      && hasRepositoryExport(content)
      && !hasDescribeMetadata(content)
    ) {
      addViolation(inventory, CATEGORIES.missingCertification, rel);
    }

    if ((rel.startsWith("src/features/") || rel.startsWith("src/pages/")) && /\blocalStorage\s*\./m.test(content)) {
      errors.push(`${rel}: localStorage access must go through platform storage helpers`);
    }
  }

  for (const [category, entries] of inventory) {
    for (const rel of entries) {
      if (!isBaselined(baseline, category, rel)) {
        errors.push(`${rel}: ${CATEGORY_LABELS[category]} must go through the platform contract or be baselined`);
      }
    }
  }

  console.log("Architecture convergence inventory:");
  for (const [category, entries] of inventory) {
    console.log(`\n${CATEGORY_LABELS[category]}:`);
    for (const item of [...entries].sort()) {
      const marker = isBaselined(baseline, category, item) ? "baseline" : "new";
      console.log(` - ${item} (${marker})`);
    }
  }

  if (errors.length) {
    console.error("\nArchitecture lint failed:\n\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log("\nArchitecture lint OK");
}

main();
