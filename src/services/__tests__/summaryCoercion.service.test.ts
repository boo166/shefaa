import { describe, expect, it, vi, beforeEach } from "vitest";
import { pharmacyService } from "@/services/pharmacy/pharmacy.service";
import { billingService } from "@/services/billing/billing.service";
import { insuranceService } from "@/services/insurance/insurance.service";
import { pharmacyRepository } from "@/services/pharmacy/pharmacy.repository";
import { billingRepository } from "@/services/billing/billing.repository";
import { insuranceRepository } from "@/services/insurance/insurance.repository";

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({ tenantId: "00000000-0000-0000-0000-000000000111", userId: "00000000-0000-0000-0000-000000000222" }),
}));

vi.mock("@/services/pharmacy/pharmacy.repository", () => ({
  pharmacyRepository: {
    getSummary: vi.fn(),
  },
}));

vi.mock("@/services/billing/billing.repository", () => ({
  billingRepository: {
    getSummary: vi.fn(),
  },
}));

vi.mock("@/services/insurance/insurance.repository", () => ({
  insuranceRepository: {
    getSummary: vi.fn(),
  },
}));

const pharmacyRepo = vi.mocked(pharmacyRepository, true);
const billingRepo = vi.mocked(billingRepository, true);
const insuranceRepo = vi.mocked(insuranceRepository, true);

describe("summary coercion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("coerces pharmacy summary numeric strings", async () => {
    pharmacyRepo.getSummary.mockResolvedValue({
      total_count: "3",
      low_stock_count: "1",
      inventory_value: "125.5",
    } as any);

    const result = await pharmacyService.getSummary();

    expect(result.total_count).toBe(3);
    expect(result.low_stock_count).toBe(1);
    expect(result.inventory_value).toBe(125.5);
  });

  it("coerces billing summary numeric strings", async () => {
    billingRepo.getSummary.mockResolvedValue({
      total_count: "10",
      paid_count: "6",
      paid_amount: "4200.25",
      pending_amount: "800.5",
    } as any);

    const result = await billingService.getSummary();

    expect(result.total_count).toBe(10);
    expect(result.paid_count).toBe(6);
    expect(result.paid_amount).toBe(4200.25);
    expect(result.pending_amount).toBe(800.5);
  });

  it("coerces insurance summary numeric strings", async () => {
    insuranceRepo.getSummary.mockResolvedValue({
      total_count: "8",
      pending_count: "2",
      approved_count: "5",
      rejected_count: "1",
      providers_count: "3",
    } as any);

    const result = await insuranceService.getSummary();

    expect(result.total_count).toBe(8);
    expect(result.pending_count).toBe(2);
    expect(result.approved_count).toBe(5);
    expect(result.rejected_count).toBe(1);
    expect(result.providers_count).toBe(3);
  });
});
