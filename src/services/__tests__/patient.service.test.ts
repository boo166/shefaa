import { beforeEach, describe, expect, it, vi } from "vitest";
import { patientRepository } from "@/services/patients/patient.repository";

vi.mock("@/services/patients/patient.repository", () => ({
  patientRepository: {
    listPaged: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findByNameAndDOB: vi.fn(),
    hasActiveAppointments: vi.fn(),
    deleteBulk: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  },
}));

vi.mock("@/services/events/domainEvent.repository", () => ({
  domainEventRepository: {
    insert: vi.fn(),
  },
}));

vi.mock("@/services/supabase/tenant", () => ({
  getTenantContext: () => ({
    tenantId: "00000000-0000-0000-0000-000000000111",
    userId: "00000000-0000-0000-0000-000000000222",
  }),
}));

const tenantId = "00000000-0000-0000-0000-000000000111";
const userId = "00000000-0000-0000-0000-000000000222";

const authCfg = vi.hoisted(() => ({
  allow: true,
}));

vi.mock("@/core/auth/authStore", () => ({
  useAuth: {
    getState: () => ({
      user: {
        id: userId,
        tenantId,
        globalRoles: [] as string[],
        tenantRoles: ["clinic_admin"] as string[],
        tenantStatus: "active" as const,
      },
      tenantOverride: null,
      sessionVersion: "patient-test-sv",
      privilegedAuth: { currentLevel: null as const, verifiedFactorCount: 0, nextLevel: null as const },
      hasPermission: () => authCfg.allow,
    }),
  },
  selectEffectiveTenantId: (s: { user?: { tenantId?: string | null } }) => s.user?.tenantId ?? null,
}));

import { patientService } from "@/services/patients/patient.service";

describe("patientService permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authCfg.allow = true;
  });

  it("blocks list when lacking view permissions", async () => {
    authCfg.allow = false;
    await expect(patientService.listPaged({ page: 1, pageSize: 10 })).rejects.toThrow(/Insufficient permission|Not authorized/);
  });

  it("blocks create when lacking manage permissions", async () => {
    authCfg.allow = false;
    await expect(patientService.create({ full_name: "Patient X" } as any)).rejects.toThrow(/Insufficient permission|Not authorized/);
  });

  it("passes tenant context when creating a patient", async () => {
    const repo = vi.mocked(patientRepository, true);
    repo.findByNameAndDOB.mockResolvedValue([]);
    repo.create.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000333",
      tenant_id: tenantId,
      patient_code: "PT-1001",
      full_name: "Test Patient",
      status: "active",
      created_at: "2026-03-14T10:00:00Z",
      updated_at: "2026-03-14T10:00:00Z",
    } as any);

    await patientService.create({ full_name: "Test Patient" } as any);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: "Test Patient" }),
      tenantId,
      userId,
    );
  });

  it("prevents duplicate patients with same name and DOB", async () => {
    const repo = vi.mocked(patientRepository, true);
    repo.findByNameAndDOB.mockResolvedValue([
      {
        id: "00000000-0000-0000-0000-000000000777",
        patient_code: "PT-1007",
        full_name: "Jane Smith",
        date_of_birth: "1990-01-15",
      } as any,
    ]);

    await expect(
      patientService.create({ full_name: "Jane Smith", date_of_birth: "1990-01-15" } as any),
    ).rejects.toThrow("already exists");
  });

  it("blocks deactivation when patient has active appointments", async () => {
    const repo = vi.mocked(patientRepository, true);
    repo.hasActiveAppointments.mockResolvedValue(true);

    await expect(
      patientService.update("00000000-0000-0000-0000-000000000333", { status: "inactive" } as any),
    ).rejects.toThrow("active appointments");
  });
});
