import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceError } from "@/services/supabase/errors";
import { assertBillingMoneyNonNegative } from "@/platform/billing/invariants";
import { RuntimeMode } from "@/platform/runtime/policy";
import { clearLocalContainmentOverride, setLocalContainmentOverride } from "@/platform/runtime/mode/runtimeContainmentStore";
import { platformRepository } from "@/platform/data/platformRepository";

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
  privilegedAuth: { currentLevel: null as "aal1" | "aal2" | null, verifiedFactorCount: 0, nextLevel: null as null },
  hasPermission: () => true,
}));

vi.mock("@/core/auth/authStore", () => ({
  useAuth: { getState: () => mockState },
  selectEffectiveTenantId: (s: typeof mockState) =>
    s.user?.globalRoles?.includes("super_admin") ? s.tenantOverride?.id ?? null : s.user?.tenantId ?? null,
}));

vi.mock("@/services/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));

describe("billing hardening", () => {
  beforeEach(() => {
    process.env.VITE_RUNTIME_POLICY_ENFORCE = "1";
    clearLocalContainmentOverride();
  });

  afterEach(() => {
    delete process.env.VITE_RUNTIME_POLICY_ENFORCE;
    clearLocalContainmentOverride();
  });

  it("rejects negative payment amounts before RPC", async () => {
    const { billingRepository } = await import("../billing.repository");
    await expect(
      billingRepository.postPaymentAtomic(
        "inv-1",
        {
          amount: -1,
          payment_method: "cash",
          idempotency_key: "k1",
        } as any,
        "t-1",
        "u-1",
      ),
    ).rejects.toMatchObject({ code: "BILLING_INVALID_AMOUNT" });
  });

  it("assertBillingMoneyNonNegative throws BusinessRuleError", () => {
    expect(() => assertBillingMoneyNonNegative(NaN, "x")).toThrow();
  });

  it("blocks financial writes under READONLY when policy enforce is on", () => {
    setLocalContainmentOverride({ mode: RuntimeMode.READONLY, version: 99 });
    let thrown: unknown;
    try {
      platformRepository.from("invoices", {
        action: "billing.invoice.create",
        classification: "financial",
        tenantScoped: true,
        tenantId: "t-1",
        subsystem: "billing",
      });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ServiceError);
    expect((thrown as ServiceError).code).toBe("RUNTIME_MODE_BLOCKED");
  });

  it("allows billing reads under READONLY", async () => {
    setLocalContainmentOverride({ mode: RuntimeMode.READONLY, version: 99 });
    expect(() =>
      platformRepository.from("invoices", {
        action: "billing.invoice.listPaged",
        classification: "readonly",
        tenantScoped: true,
        tenantId: "t-1",
      }),
    ).not.toThrow();
  });
});
