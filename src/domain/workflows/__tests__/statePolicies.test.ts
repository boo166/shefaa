import { describe, expect, it } from "vitest";
import { statePolicies } from "../statePolicies";

describe("statePolicies.billing", () => {
  it("allows pending to overdue, void, and written_off", () => {
    expect(statePolicies.billing.canTransition("pending", "overdue")).toBe(true);
    expect(statePolicies.billing.canTransition("pending", "void")).toBe(true);
    expect(statePolicies.billing.canTransition("pending", "written_off")).toBe(true);
  });

  it("allows paid to partially_refunded and refunded", () => {
    expect(statePolicies.billing.canTransition("paid", "partially_refunded")).toBe(true);
    expect(statePolicies.billing.canTransition("paid", "refunded")).toBe(true);
    expect(statePolicies.billing.canTransition("paid", "void")).toBe(false);
  });

  it("allows partially_paid post-payment correction paths", () => {
    expect(statePolicies.billing.canTransition("partially_paid", "partially_refunded")).toBe(true);
    expect(statePolicies.billing.canTransition("partially_paid", "refunded")).toBe(true);
    expect(statePolicies.billing.canTransition("partially_paid", "written_off")).toBe(true);
  });

  it("treats refunded and written_off as terminal", () => {
    expect(statePolicies.billing.canTransition("refunded", "pending")).toBe(false);
    expect(statePolicies.billing.canTransition("written_off", "pending")).toBe(false);
    expect(statePolicies.billing.canTransition("void", "paid")).toBe(false);
  });

  it("allows identity transitions", () => {
    expect(statePolicies.billing.canTransition("paid", "paid")).toBe(true);
    expect(statePolicies.billing.canTransition("partially_refunded", "partially_refunded")).toBe(true);
  });
});

describe("statePolicies.appointments", () => {
  it("allows scheduled to in_progress, cancelled, and no_show", () => {
    expect(statePolicies.appointments.canTransition("scheduled", "in_progress")).toBe(true);
    expect(statePolicies.appointments.canTransition("scheduled", "cancelled")).toBe(true);
    expect(statePolicies.appointments.canTransition("scheduled", "no_show")).toBe(true);
  });

  it("blocks completed to any active state", () => {
    expect(statePolicies.appointments.canTransition("completed", "scheduled")).toBe(false);
    expect(statePolicies.appointments.canTransition("completed", "in_progress")).toBe(false);
    expect(statePolicies.appointments.canTransition("completed", "cancelled")).toBe(false);
  });

  it("allows cancelled and no_show reschedule paths", () => {
    expect(statePolicies.appointments.canTransition("cancelled", "scheduled")).toBe(true);
    expect(statePolicies.appointments.canTransition("no_show", "scheduled")).toBe(true);
    expect(statePolicies.appointments.canTransition("no_show", "cancelled")).toBe(true);
  });
});
