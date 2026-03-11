import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const envLocal = path.join(root, ".env.local");
const envLocalExample = path.join(root, ".env.local.example");
const envLocalDisabled = path.join(root, ".env.local.disabled");

const mode = (process.argv[2] || "").toLowerCase();

const fileExists = (filePath) => fs.existsSync(filePath);

const renameSafe = (from, to) => {
  if (!fileExists(from)) return null;
  let target = to;
  if (fileExists(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    target = `${to}.${stamp}`;
  }
  fs.renameSync(from, target);
  return target;
};

const copyIfMissing = (from, to) => {
  if (fileExists(to)) return false;
  if (!fileExists(from)) {
    throw new Error(`Missing ${path.basename(from)}. Cannot create ${path.basename(to)}.`);
  }
  fs.copyFileSync(from, to);
  return true;
};

const status = () => {
  if (fileExists(envLocal)) {
    console.log("Active env: local (.env.local present)");
  } else {
    console.log("Active env: remote (.env.local not present)");
  }
};

try {
  if (mode === "local") {
    if (fileExists(envLocal)) {
      console.log("Local env already active (.env.local exists).");
    } else if (fileExists(envLocalDisabled)) {
      const restored = renameSafe(envLocalDisabled, envLocal);
      console.log(`Restored ${path.basename(restored)} -> .env.local`);
    } else {
      const created = copyIfMissing(envLocalExample, envLocal);
      if (created) {
        console.log("Created .env.local from .env.local.example.");
      }
    }
    status();
  } else if (mode === "remote") {
    const disabled = renameSafe(envLocal, envLocalDisabled);
    if (disabled) {
      console.log(`Disabled local env: ${path.basename(disabled)}`);
    } else {
      console.log("No .env.local found. Remote env already active.");
    }
    status();
  } else if (mode === "status") {
    status();
  } else {
    console.log("Usage: node scripts/switch-env.mjs <local|remote|status>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
