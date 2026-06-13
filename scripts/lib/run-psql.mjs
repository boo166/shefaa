import { execSync } from "node:child_process";
import path from "node:path";

import { resolveSupabaseTarget } from "./supabase-target.mjs";

function resolveDbContainer() {
  const output = execSync('docker ps --filter "name=supabase_db" --format "{{.Names}}"', {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const name = output.split(/\r?\n/).find(Boolean);
  if (!name) throw new Error("Local Supabase DB container not found. Is Docker running?");
  return name;
}

export function runPsqlSql(sql, cwd = process.cwd()) {
  const target = resolveSupabaseTarget(cwd);
  const oneLine = sql.replace(/\s+/g, " ").trim();
  const escaped = oneLine.replace(/"/g, '\\"');

  if (target.dbUrl) {
    try {
      execSync(`psql "${target.dbUrl}" -v ON_ERROR_STOP=1 -c "${escaped}"`, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return;
    } catch (error) {
      const message = String(error.stderr ?? error.message ?? "");
      if (!message.includes("not recognized") && !message.includes("ENOENT")) {
        throw error;
      }
    }
  }

  const container = resolveDbContainer();
  execSync(`docker exec ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "${escaped}"`, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function runPsqlFile(filePath, cwd = process.cwd()) {
  const target = resolveSupabaseTarget(cwd);
  const quotedPath = filePath.replace(/"/g, '\\"');

  if (target.dbUrl) {
    try {
      return execSync(`psql "${target.dbUrl}" -v ON_ERROR_STOP=1 -f "${quotedPath}"`, {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const message = String(error.stderr ?? error.message ?? "");
      if (!message.includes("not recognized") && !message.includes("ENOENT")) {
        throw error;
      }
    }
  }

  const container = resolveDbContainer();
  const containerPath = `/tmp/${path.basename(filePath)}`;
  execSync(`docker cp "${quotedPath}" ${container}:${containerPath}`, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  return execSync(`docker exec ${container} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f "${containerPath}"`, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
