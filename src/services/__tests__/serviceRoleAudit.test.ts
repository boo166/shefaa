import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FUNCTIONS_DIR = path.resolve(__dirname, "../../../supabase/functions");

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

describe("service role safety audit", () => {
  it("only approved automation functions use the service role key", () => {
    const entries = fs
      .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
      .filter((name) => !name.startsWith("_"));

    const offenders: string[] = [];

    for (const name of entries) {
      const filePath = path.join(FUNCTIONS_DIR, name, "index.ts");
      if (!fs.existsSync(filePath)) continue;
      const contents = fs.readFileSync(filePath, "utf8");
      if (contents.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        if (!ALLOWED_SERVICE_ROLE_FUNCTIONS.has(name)) {
          offenders.push(name);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
