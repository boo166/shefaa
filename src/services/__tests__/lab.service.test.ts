import { beforeEach, describe, expect, it, vi } from "vitest";
import { labRepository } from "@/services/laboratory/lab.repository";

const emitDomainEvent = vi.hoisted(() => vi.fn());
const rateLimitService = vi.hoisted(() => ({ assertAllowed: vi.fn() }));

vi.mock("@/services/laboratory/lab.repository", () => ({
  labRepository: {
    listPaged: vi.fn(),
    listPagedWithRelations: vi.fn(),
    countByStatus: vi.fn(),
    listByPatient: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    finalizeResult: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  },
}));

vi.mock("@/core/events", () => ({
  emitDomainEvent,
}));

vi.mock("@/services/security/rateLimit.service", () => ({
  rateLimitService,
}));

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({
    tenantId: "00000000-0000-0000-0000-000000000111",
    userId: "00000000-0000-0000-0000-000000000222",
  }),
}));

vi.mock("@/services/settings/audit.service", () => ({
  auditLogService: {
    logEvent: vi.fn(),
  },
}));

vi.mock("@/services/subscription/featureAccess.service", () => ({
  featureAccessService: {
    assertFeatureAccess: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("labService permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    emitDomainEvent.mockResolvedValue(undefined);
    rateLimitService.assertAllowed.mockResolvedValue(undefined);
  });

  it("blocks list when lacking view permissions", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => false }),
      },
    }));
    const { labService } = await import("@/services/laboratory/lab.service");

    await expect(
      labService.listPaged({ page: 1, pageSize: 10 }),
    ).rejects.toThrow("Not authorized");
  });

  it("blocks create when lacking manage permissions", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => false }),
      },
    }));
    const { labService } = await import("@/services/laboratory/lab.service");

    await expect(
      labService.create({
        patient_id: "00000000-0000-0000-0000-000000000aaa",
        doctor_id: "00000000-0000-0000-0000-000000000bbb",
        test_name: "CBC",
      } as any),
    ).rejects.toThrow("Not authorized");
  });

  it("does not emit LabResultUploaded when only creating a lab order", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(labRepository, true);
    repo.create.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000333",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      patient_id: "00000000-0000-0000-0000-000000000aaa",
      doctor_id: "00000000-0000-0000-0000-000000000bbb",
      test_name: "CBC",
      order_date: "2026-04-16",
      status: "pending",
      result: null,
      result_value: null,
      result_unit: null,
      reference_range: null,
      abnormal_flag: null,
      result_notes: null,
      resulted_at: null,
      deleted_at: null,
      deleted_by: null,
      created_at: "2026-04-16T10:00:00Z",
      updated_at: "2026-04-16T10:00:00Z",
    } as any);

    const { labService } = await import("@/services/laboratory/lab.service");

    await labService.create({
      patient_id: "00000000-0000-0000-0000-000000000aaa",
      doctor_id: "00000000-0000-0000-0000-000000000bbb",
      test_name: "CBC",
      order_date: "2026-04-16",
    });

    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("requires a structured result value before completion", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(labRepository, true);
    repo.getById.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000333",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      patient_id: "00000000-0000-0000-0000-000000000aaa",
      doctor_id: "00000000-0000-0000-0000-000000000bbb",
      test_name: "CBC",
      order_date: "2026-04-16",
      status: "processing",
      result: null,
      result_value: null,
      result_unit: null,
      reference_range: null,
      abnormal_flag: null,
      result_notes: null,
      resulted_at: null,
      deleted_at: null,
      deleted_by: null,
      created_at: "2026-04-16T10:00:00Z",
      updated_at: "2026-04-16T10:00:00Z",
    } as any);

    const { labService } = await import("@/services/laboratory/lab.service");

    await expect(
      labService.update("00000000-0000-0000-0000-000000000333", {
        status: "completed",
      }),
    ).rejects.toThrow("Completed lab results must include a structured result entry");
  });

  it("uses the DB command when a structured completed result is saved", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(labRepository, true);
    repo.getById.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000333",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      patient_id: "00000000-0000-0000-0000-000000000aaa",
      doctor_id: "00000000-0000-0000-0000-000000000bbb",
      test_name: "CBC",
      order_date: "2026-04-16",
      status: "processing",
      result: null,
      result_value: null,
      result_unit: null,
      reference_range: null,
      abnormal_flag: null,
      result_notes: null,
      resulted_at: null,
      deleted_at: null,
      deleted_by: null,
      created_at: "2026-04-16T10:00:00Z",
      updated_at: "2026-04-16T10:00:00Z",
    } as any);
    repo.finalizeResult.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000333",
      tenant_id: "00000000-0000-0000-0000-000000000111",
      patient_id: "00000000-0000-0000-0000-000000000aaa",
      doctor_id: "00000000-0000-0000-0000-000000000bbb",
      test_name: "CBC",
      order_date: "2026-04-16",
      status: "completed",
      result: "11.2 g/dL | 12.0 - 16.0 | low",
      result_value: "11.2",
      result_unit: "g/dL",
      reference_range: "12.0 - 16.0",
      abnormal_flag: "low",
      result_notes: "Mild anemia pattern",
      resulted_at: "2026-04-16T11:00:00Z",
      deleted_at: null,
      deleted_by: null,
      created_at: "2026-04-16T10:00:00Z",
      updated_at: "2026-04-16T11:00:00Z",
    } as any);

    const { labService } = await import("@/services/laboratory/lab.service");

    await labService.update("00000000-0000-0000-0000-000000000333", {
      status: "completed",
      result_value: "11.2",
      result_unit: "g/dL",
      reference_range: "12.0 - 16.0",
      abnormal_flag: "low",
      result_notes: "Mild anemia pattern",
    });

    expect(rateLimitService.assertAllowed).toHaveBeenCalled();
    expect(repo.finalizeResult).toHaveBeenCalledWith(
      "00000000-0000-0000-0000-000000000333",
      expect.objectContaining({
        result: "11.2 g/dL | 12.0 - 16.0 | low",
      }),
      "00000000-0000-0000-0000-000000000111",
      "00000000-0000-0000-0000-000000000222",
      undefined,
    );
    expect(repo.update).not.toHaveBeenCalled();
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });
});
