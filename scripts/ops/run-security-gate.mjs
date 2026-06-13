import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function run(script) {
  const result = spawnSync("npm", ["run", script], { cwd: ROOT, encoding: "utf8", shell: true });
  if ((result.status ?? 1) !== 0) process.exitCode = 1;
}

run("ops:security-audit");
run("ops:npm-audit-triage");
