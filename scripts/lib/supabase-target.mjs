import { execSync } from "node:child_process";

import { loadLocalEnv } from "./env.mjs";
import { isLocalSupabaseUrl, parseLocalStatusJson } from "./supabase-local.mjs";

export { isLocalSupabaseUrl, parseLocalStatusJson } from "./supabase-local.mjs";

function readLocalSupabaseStatus(cwd = process.cwd()) {
  try {
    const raw = execSync("supabase status -o json", {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const status = parseLocalStatusJson(raw);
    if (!status?.API_URL || !status?.SERVICE_ROLE_KEY) return null;
    if (!isLocalSupabaseUrl(status.API_URL)) return null;
    return status;
  } catch {
    return null;
  }
}

export function resolveSupabaseTarget(cwd = process.cwd()) {
  loadLocalEnv(cwd, [".env", ".env.local", ".env.e2e.local"]);

  const prefer = (process.env.SUPABASE_TARGET ?? "auto").toLowerCase();
  const local = prefer !== "remote" ? readLocalSupabaseStatus(cwd) : null;

  if (prefer === "local" || (prefer === "auto" && local)) {
    if (!local) {
      return {
        source: "local",
        url: null,
        serviceRoleKey: null,
        dbUrl: null,
        publishableKey: null,
      };
    }
    return {
      source: "local",
      url: local.API_URL,
      serviceRoleKey: local.SERVICE_ROLE_KEY,
      dbUrl: local.DB_URL,
      publishableKey: local.PUBLISHABLE_KEY ?? local.ANON_KEY,
    };
  }

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const dbUrl = process.env.SUPABASE_DB_URL ?? process.env.DATABASE_URL;

  return {
    source: "remote",
    url,
    serviceRoleKey,
    dbUrl,
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.E2E_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function assertSupabaseTarget(target) {
  if (!target.url || !target.serviceRoleKey) {
    const hint =
      target.source === "local"
        ? "Start local Supabase: `supabase start`"
        : "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or use SUPABASE_TARGET=local";
    throw new Error(`Missing Supabase credentials (${target.source}). ${hint}`);
  }
}
