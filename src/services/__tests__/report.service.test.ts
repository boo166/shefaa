import { describe, expect, it, vi, beforeEach } from "vitest";
import { reportService } from "@/services/reports/report.service";
import { reportRepository } from "@/services/reports/report.repository";

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({ tenantId: "00000000-0000-0000-0000-000000000111", userId: "00000000-0000-0000-0000-000000000222" }),
}));

vi.mock("@/services/reports/report.repository", () => ({
  reportRepository: {
    getOverview: vi.fn(),
    getRevenueByMonth: vi.fn(),
    getPatientGrowth: vi.fn(),
    getAppointmentTypes: vi.fn(),
    getAppointmentStatuses: vi.fn(),
    getRevenueByService: vi.fn(),
    getDoctorPerformance: vi.fn(),
  },
}));

const repo = vi.mocked(reportRepository, true);

describe("reportService aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("coerces overview numeric values", async () => {
    repo.getOverview.mockResolvedValue({
      total_revenue: "1200.5",
      total_patients: "25",
      total_appointments: "40",
      avg_doctor_rating: "4.2",
    } as any);

    const result = await reportService.getOverview();

    expect(result.total_revenue).toBe(1200.5);
    expect(result.total_patients).toBe(25);
    expect(result.total_appointments).toBe(40);
    expect(result.avg_doctor_rating).toBe(4.2);
  });

  it("maps revenue by month to labels", async () => {
    repo.getRevenueByMonth.mockResolvedValue([
      { month_start: "2026-01-01", revenue: "100", expenses: "40" },
      { month_start: "2026-02-01", revenue: "200", expenses: "50" },
    ] as any);

    const result = await reportService.getRevenueByMonth(6);

    expect(result).toHaveLength(2);
    expect(result[0].month).toMatch(/Jan/);
    expect(result[1].month).toMatch(/Feb/);
    expect(result[0].revenue).toBe(100);
    expect(result[0].expenses).toBe(40);
  });

  it("aggregates appointment status counts", async () => {
    repo.getAppointmentStatuses.mockResolvedValue([
      { status: "scheduled", count: "2" },
      { status: "completed", count: "5" },
    ] as any);

    const result = await reportService.getAppointmentStatusCounts();

    expect(result.scheduled).toBe(2);
    expect(result.completed).toBe(5);
    expect(result.in_progress).toBe(0);
    expect(result.cancelled).toBe(0);
  });
});
