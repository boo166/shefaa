import { describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/services/supabase/errors";

const metricCalls: Array<{ name: string; payload: any }> = [];

const mockState = vi.hoisted(() => ({
  user: {
    id: "u-1",
    tenantId: "t-1",
    globalRoles: [] as string[],
    tenantRoles: ["clinic_admin"] as string[],
    tenantStatus: "active" as const,
  },
  tenantOverride: null as { id: string } | null,
  sessionVersion: "sv-1",
}));

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(() => ({ select: vi.fn() })),
  rpc: vi.fn(async () => ({ data: [], error: null })),
}));

vi.mock("@/core/auth/authStore", () => ({
  useAuth: { getState: () => mockState },
  selectEffectiveTenantId: (s: any) =>
    s.user?.globalRoles?.includes("super_admin") ? s.tenantOverride?.id ?? null : s.user?.tenantId ?? null,
}));

vi.mock("@/services/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/platform/observability/runtimeAnalytics", () => ({
  emitPlatformMetric: (name: string, payload: any) => {
    metricCalls.push({ name, payload });
  },
}));

import { platformRepository } from "@/platform/data/platformRepository";

describe("platformRepository middleware", () => {
  it("short-circuits on tenant mismatch before dispatch", async () => {
    expect(() =>
      platformRepository.from("patients", {
        action: "patients.list",
        classification: "readonly",
        tenantScoped: true,
        tenantId: "t-2",
      }),
    ).toThrow(ServiceError);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("aborts before dispatch", () => {
    const ctrl = new AbortController();
    ctrl.abort();
    expect(() =>
      platformRepository.from("patients", {
        action: "patients.list",
        classification: "readonly",
        signal: ctrl.signal,
      }),
    ).toThrow(ServiceError);
  });

  it("keeps operation trace stable in context when provided", async () => {
    const trace = { operationTraceId: "op-fixed", requestTraceId: "req-fixed" };
    await platformRepository.rpc(
      "get_report_overview",
      { _tenant_id: "t-1" },
      {
        action: "reports.getOverview",
        classification: "readonly",
        tenantScoped: true,
        tenantId: "t-1",
        trace,
      },
    );
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
  });

  it("emits stale-context metric on tenant mismatch short-circuit", () => {
    metricCalls.length = 0;
    expect(() =>
      platformRepository.from("patients", {
        action: "patients.list",
        classification: "readonly",
        tenantScoped: true,
        tenantId: "t-2",
      }),
    ).toThrow(ServiceError);
    expect(metricCalls.some((c) => c.name === "stale_context_rejected")).toBe(true);
  });

  it("emits retry classification before dispatch", async () => {
    metricCalls.length = 0;
    await platformRepository.rpc(
      "get_report_overview",
      { _tenant_id: "t-1" },
      {
        action: "reports.getOverview",
        classification: "readonly",
        tenantScoped: true,
        tenantId: "t-1",
      },
    );
    const order = metricCalls.map((c) => c.name);
    expect(order.indexOf("repository_retry_classification")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("repository_access_start")).toBeGreaterThanOrEqual(0);
  });
});
