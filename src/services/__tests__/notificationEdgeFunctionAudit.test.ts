import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const FUNCTIONS_DIR = path.resolve(__dirname, "../../../supabase/functions");

const COMMAND_OWNED_NOTIFICATION_FUNCTIONS = [
  "send-invoice-emails",
  "appointment-reminders",
  "event-delivery-worker",
] as const;

function readFunctionSource(name: string) {
  const filePath = path.join(FUNCTIONS_DIR, name, "index.ts");
  expect(fs.existsSync(filePath), `${name} index.ts should exist`).toBe(true);
  return fs.readFileSync(filePath, "utf8");
}

describe("notification delivery edge function authority", () => {
  for (const name of COMMAND_OWNED_NOTIFICATION_FUNCTIONS) {
    it(`${name} delivers notifications through command_notification_delivery`, () => {
      const contents = readFunctionSource(name);
      expect(contents).toContain('rpc("command_notification_delivery"');
      expect(contents).not.toMatch(/from\s*\(\s*["']notifications["']\s*\)\s*\.insert/);
    });
  }

  it("send-invoice-emails uses deterministic billing-email-job delivery keys", () => {
    const contents = readFunctionSource("send-invoice-emails");
    expect(contents).toContain("billing-email-job:${input.tenantId}:${input.requestId}:${input.userId}");
    expect(contents).toContain('p_type: "billing_email_job"');
    expect(contents).toMatch(/throw new Error\(error\.message/);
  });

  it("appointment-reminders uses deterministic in_app delivery keys and surfaces command failures", () => {
    const contents = readFunctionSource("appointment-reminders");
    expect(contents).toContain(
      "appointment-reminder:${input.tenantId}:${input.appointmentId}:${input.doctorUserId}:in_app",
    );
    expect(contents).toContain('p_type: "appointment_reminder"');
    expect(contents).toContain("notification_preferences");
    expect(contents).toContain("appointment_reminders");
    expect(contents).toMatch(/throw new Error\(error\.message/);
  });
});
