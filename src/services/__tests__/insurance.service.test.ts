import { beforeEach, describe, expect, it, vi } from "vitest";
import { insuranceRepository } from "@/services/insurance/insurance.repository";

const tenantId = "00000000-0000-0000-0000-000000000111";
const userId = "00000000-0000-0000-0000-000000000222";
const patientId = "00000000-0000-0000-0000-000000000333";
const claimId = "00000000-0000-0000-0000-000000000444";

vi.mock("@/services/insurance/insurance.repository", () => ({
  insuranceRepository: {
    listPaged: vi.fn(),
    listPagedWithRelations: vi.fn(),
    getSummary: vi.fn(),
    getOperationsSummary: vi.fn(),
    listAssignableOwners: vi.fn(),
    isAssignableOwner: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    transitionStatus: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
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

vi.mock("@/services/settings/audit.service", () => ({
  auditLogService: {
    logEvent: vi.fn(),
  },
}));

const buildClaim = (overrides: Record<string, unknown> = {}) => ({
  id: claimId,
  tenant_id: tenantId,
  patient_id: patientId,
  provider: "National Health Co.",
  service: "Cardiology consultation",
  amount: 250,
  claim_date: "2026-04-16",
  status: "draft",
  submitted_at: null,
  processing_started_at: null,
  approved_at: null,
  reimbursed_at: null,
  payer_reference: null,
  denial_reason: null,
  assigned_to_user_id: null,
  internal_notes: null,
  payer_notes: null,
  last_follow_up_at: null,
  next_follow_up_at: null,
  resubmission_count: 0,
  deleted_at: null,
  deleted_by: null,
  created_at: "2026-04-16T08:00:00.000Z",
  updated_at: "2026-04-16T08:00:00.000Z",
  ...overrides,
});

describe("insuranceService workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.mocked(insuranceRepository.isAssignableOwner).mockResolvedValue(true);
  });

  it("blocks list when lacking billing permissions", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => false }),
      },
    }));
    const { insuranceService } = await import("@/services/insurance/insurance.service");

    await expect(
      insuranceService.listPaged({ page: 1, pageSize: 10 }),
    ).rejects.toThrow("Not authorized");
  });

  it("creates draft claims by default", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(insuranceRepository, true);
    repo.create.mockResolvedValue(buildClaim());

    const { insuranceService } = await import("@/services/insurance/insurance.service");

    await insuranceService.create({
      patient_id: patientId,
      provider: "National Health Co.",
      service: "Cardiology consultation",
      amount: 250,
      claim_date: "2026-04-16",
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "draft",
        submitted_at: null,
        processing_started_at: null,
        denial_reason: null,
      }),
      tenantId,
    );
  });

  it("sets submitted_at when a draft claim is submitted", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(insuranceRepository, true);
    repo.getById.mockResolvedValue(buildClaim());
    repo.transitionStatus.mockResolvedValue(buildClaim({
      status: "submitted",
      submitted_at: "2026-04-16T09:00:00.000Z",
    }));

    const { insuranceService } = await import("@/services/insurance/insurance.service");

    await insuranceService.update(claimId, { status: "submitted" });

    expect(repo.transitionStatus).toHaveBeenCalledWith(
      claimId,
      expect.objectContaining({
        status: "submitted",
        submitted_at: expect.any(String),
        denial_reason: null,
      }),
      tenantId,
      userId,
      undefined,
    );
  });

  it("requires a denial reason when denying a claim", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(insuranceRepository, true);
    repo.getById.mockResolvedValue(buildClaim({
      status: "processing",
      submitted_at: "2026-04-16T09:00:00.000Z",
      processing_started_at: "2026-04-16T10:00:00.000Z",
    }));

    const { insuranceService } = await import("@/services/insurance/insurance.service");

    await expect(
      insuranceService.update(claimId, { status: "denied" }),
    ).rejects.toThrow("Denied claims require a denial reason");
  });

  it("requires a payer reference before reimbursement", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(insuranceRepository, true);
    repo.getById.mockResolvedValue(buildClaim({
      status: "approved",
      submitted_at: "2026-04-16T09:00:00.000Z",
      processing_started_at: "2026-04-16T10:00:00.000Z",
      approved_at: "2026-04-16T12:00:00.000Z",
    }));

    const { insuranceService } = await import("@/services/insurance/insurance.service");

    await expect(
      insuranceService.update(claimId, { status: "reimbursed" }),
    ).rejects.toThrow("Reimbursed claims require a payer reference");
  });

  it("reopens denied claims as corrected drafts and increments resubmission count", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(insuranceRepository, true);
    repo.getById.mockResolvedValue(buildClaim({
      status: "denied",
      denial_reason: "Eligibility terminated",
      submitted_at: "2026-04-10T09:00:00.000Z",
      resubmission_count: 1,
    }));
    repo.transitionStatus.mockResolvedValue(buildClaim({
      status: "draft",
      denial_reason: "Eligibility terminated",
      resubmission_count: 2,
    }));

    const { insuranceService } = await import("@/services/insurance/insurance.service");

    await insuranceService.update(claimId, { status: "draft" });

    expect(repo.transitionStatus).toHaveBeenCalledWith(
      claimId,
      expect.objectContaining({
        status: "draft",
        submitted_at: null,
        processing_started_at: null,
        approved_at: null,
        reimbursed_at: null,
        resubmission_count: 2,
      }),
      tenantId,
      userId,
      undefined,
    );
  });

  it("trims follow-up notes before saving", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(insuranceRepository, true);
    repo.getById.mockResolvedValue(buildClaim({
      status: "processing",
      submitted_at: "2026-04-10T09:00:00.000Z",
      processing_started_at: "2026-04-11T09:00:00.000Z",
    }));
    repo.update.mockResolvedValue(buildClaim({
      status: "processing",
      internal_notes: "Need corrected authorization number",
      payer_notes: "Payer asked for updated eligibility file",
    }));

    const { insuranceService } = await import("@/services/insurance/insurance.service");

    await insuranceService.update(claimId, {
      internal_notes: "  Need corrected authorization number  ",
      payer_notes: "  Payer asked for updated eligibility file  ",
    });

    expect(repo.update).toHaveBeenCalledWith(
      claimId,
      expect.objectContaining({
        internal_notes: "Need corrected authorization number",
        payer_notes: "Payer asked for updated eligibility file",
      }),
      tenantId,
      undefined,
    );
  });

  it("blocks skipping straight from submitted to approved", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(insuranceRepository, true);
    repo.getById.mockResolvedValue(buildClaim({
      status: "submitted",
      submitted_at: "2026-04-16T09:00:00.000Z",
    }));

    const { insuranceService } = await import("@/services/insurance/insurance.service");

    await expect(
      insuranceService.update(claimId, { status: "approved" }),
    ).rejects.toThrow("Invalid insurance claim status transition: submitted -> approved");
  });
});
