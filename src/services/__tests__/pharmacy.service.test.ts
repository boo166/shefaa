import { beforeEach, describe, expect, it, vi } from "vitest";
import { pharmacyRepository } from "@/services/pharmacy/pharmacy.repository";

const tenantId = "00000000-0000-0000-0000-000000000111";
const userId = "00000000-0000-0000-0000-000000000222";
const medicationId = "00000000-0000-0000-0000-000000000333";

vi.mock("@/services/pharmacy/pharmacy.repository", () => ({
  pharmacyRepository: {
    listPaged: vi.fn(),
    getSummary: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    adjustStock: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("@/services/subscription/featureAccess.service", () => ({
  featureAccessService: {
    assertFeatureAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({
    tenantId,
    userId,
  }),
}));

const buildMedication = (overrides: Record<string, unknown> = {}) => ({
  id: medicationId,
  tenant_id: tenantId,
  name: "Amoxicillin",
  category: "Antibiotic",
  stock: 20,
  unit: "tabs",
  price: 12,
  status: "low_stock",
  created_at: "2026-04-16T08:00:00.000Z",
  updated_at: "2026-04-16T08:00:00.000Z",
  ...overrides,
});

describe("pharmacyService operational authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("uses the DB medication command and derives status through the command result", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(pharmacyRepository, true);
    repo.update.mockResolvedValue(buildMedication({
      stock: 0,
      status: "out_of_stock",
    }) as any);

    const { pharmacyService } = await import("@/services/pharmacy/pharmacy.service");

    const result = await pharmacyService.update(medicationId, { stock: 0 });

    expect(repo.update).toHaveBeenCalledWith(medicationId, { stock: 0, status: "out_of_stock" }, tenantId, undefined);
    expect(repo.adjustStock).not.toHaveBeenCalled();
    expect(result.status).toBe("out_of_stock");
  });

  it("rejects negative stock before repository access", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(pharmacyRepository, true);

    const { pharmacyService } = await import("@/services/pharmacy/pharmacy.service");

    await expect(pharmacyService.update(medicationId, { stock: -1 } as any)).rejects.toThrow();
    expect(repo.adjustStock).not.toHaveBeenCalled();
  });
});
