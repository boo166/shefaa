import { describe, expect, it, vi, beforeEach } from "vitest";

const tenantId = "70000000-0000-0000-0000-000000000001";

vi.mock("@/platform/data/platformRepository", () => ({
  platformRepository: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

import { platformRepository } from "@/platform/data/platformRepository";
import { patientReconciliationRepository } from "../patientReconciliation.repository";
import { searchRepository } from "@/services/search/search.repository";
import { reportRepository } from "@/services/reports/report.repository";
import { patientRepository } from "@/services/patients/patient.repository";

describe("patient visibility surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searchGlobal returns only active visible patients from search_global RPC", async () => {
    vi.mocked(platformRepository.rpc).mockResolvedValue({
      data: [{
        entity_type: "patient",
        entity_id: "74000000-0000-0000-0000-000000000001",
        title: "Visible Surface Patient",
        subtitle: "VIS-ACTIVE",
        status: "active",
        event_date: "2026-06-13T00:00:00.000Z",
      }],
      error: null,
    } as never);

    const results = await searchRepository.searchGlobal(tenantId, "Surface Patient", 20);

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Visible Surface Patient");
    expect(platformRepository.rpc).toHaveBeenCalledWith(
      "search_global",
      { _term: "Surface Patient", _limit: 20, _tenant_id: tenantId },
      expect.objectContaining({
        action: "search.global",
        tenantScoped: true,
        tenantId,
      }),
    );
  });

  it("searchGlobal excludes deleted patient rows from mocked RPC surface", async () => {
    vi.mocked(platformRepository.rpc).mockResolvedValue({
      data: [],
      error: null,
    } as never);

    const results = await searchRepository.searchGlobal(tenantId, "Deleted Surface Patient", 10);

    expect(results).toEqual([]);
  });

  it("getOverview uses get_report_overview and excludes deleted patients from totals", async () => {
    vi.mocked(platformRepository.rpc).mockResolvedValue({
      data: [{
        total_revenue: 0,
        total_patients: 1,
        total_appointments: 0,
        avg_doctor_rating: 0,
      }],
      error: null,
    } as never);

    const overview = await reportRepository.getOverview(tenantId);

    expect(overview.total_patients).toBe(1);
    expect(platformRepository.rpc).toHaveBeenCalledWith(
      "get_report_overview",
      { _tenant_id: tenantId },
      expect.objectContaining({
        action: "reports.getOverview",
        tenantScoped: true,
        tenantId,
      }),
    );
  });

  it("listPaged queries active patients only through repository filters", async () => {
    const fromMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [{ id: "74000000-0000-0000-0000-000000000001", full_name: "Active Only" }], error: null, count: 1 }),
    });
    vi.mocked(platformRepository.from).mockReturnValue(fromMock() as never);

    const page = await patientRepository.listPaged({ page: 1, pageSize: 10 }, tenantId);

    expect(page.data).toHaveLength(1);
    expect(fromMock).toHaveBeenCalled();
  });

  it("runs patient reconciliation through run_patient_reconciliation RPC", async () => {
    vi.mocked(platformRepository.rpc).mockResolvedValue({
      data: [{
        run_id: "88000000-0000-0000-0000-000000000001",
        finding_count: 2,
        critical_count: 0,
        warning_count: 1,
      }],
      error: null,
    } as never);

    const summary = await patientReconciliationRepository.run({
      tenantId,
      windowStart: "2026-05-01T00:00:00.000Z",
      windowEnd: "2026-06-13T00:00:00.000Z",
      dryRun: false,
      requestTraceId: "req-patient-visibility",
      operationTraceId: "op-patient-visibility",
      workflowTraceId: "wf-patient-visibility",
    });

    expect(summary.finding_count).toBe(2);
    expect(platformRepository.rpc).toHaveBeenCalledWith(
      "run_patient_reconciliation",
      expect.objectContaining({
        p_tenant_id: tenantId,
        p_dry_run: false,
        p_workflow_trace_id: "wf-patient-visibility",
      }),
      expect.objectContaining({
        action: "patients.reconciliation.run",
        tenantScoped: true,
        tenantId,
      }),
    );
  });
});
