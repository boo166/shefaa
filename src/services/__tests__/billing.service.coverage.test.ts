import type { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoiceSchema } from "@/domain/billing/billing.schema";
import { billingRepository } from "@/services/billing/billing.repository";
import { featureAccessService } from "@/services/subscription/featureAccess.service";

type InvoiceRow = z.infer<typeof invoiceSchema>;

type BillingEntitlementSnapshot = Awaited<ReturnType<typeof featureAccessService.assertFeatureAccess>>;

const billingEntitlementSnapshot = {
  plan: "enterprise",
  status: "active",
  isExpired: false,
  flags: [],
} satisfies BillingEntitlementSnapshot;

const tenantId = "00000000-0000-0000-0000-000000000111";
const userId = "00000000-0000-0000-0000-000000000222";
const patientId = "00000000-0000-0000-0000-000000000333";
const invoiceId = "00000000-0000-0000-0000-000000000444";
const paymentId = "00000000-0000-0000-0000-000000000555";
const futureDueDate = "2099-04-20";

const emitDomainEvent = vi.hoisted(() => vi.fn());

const billingAuthExtras = vi.hoisted(() => ({
  getStateExtras: () => ({} as Record<string, unknown>),
}));

vi.mock("@/platform/runtime/mode/runtimeModeController", () => ({
  runtimeModeController: {
    getSnapshot: () => ({
      effective: { effectiveMode: "NORMAL", version: 0, freezes: undefined },
      global: null,
      tenant: null,
    }),
    subscribe: () => () => {},
    startAutoRefresh: () => () => {},
    refresh: async () => {},
  },
}));

vi.mock("@/core/auth/authStore", () => ({
  useAuth: {
    getState: () => {
      const priv = {
        currentLevel: "aal1" as const,
        nextLevel: "aal2" as const,
        verifiedFactorCount: 0,
        unverifiedFactorCount: 0,
        loadedAt: new Date().toISOString(),
      };
      return {
        hasPermission: () => true,
        user: {
          id: userId,
          tenantId,
          tenantRoles: ["clinic_admin"],
          globalRoles: [] as string[],
          tenantStatus: "active" as const,
        },
        tenantOverride: null,
        sessionVersion: `${userId}:${tenantId}:1`,
        privilegedAuth: priv,
        ...billingAuthExtras.getStateExtras(),
      };
    },
  },
  selectEffectiveTenantId: (s: { user?: { tenantId?: string | null }; tenantOverride?: { id: string } | null }) =>
    s.user?.tenantId ?? s.tenantOverride?.id ?? null,
}));

vi.mock("@/services/billing/billing.repository", () => ({
  billingRepository: {
    listPaged: vi.fn(),
    listPagedWithRelations: vi.fn(),
    getSummary: vi.fn(),
    countInRange: vi.fn(),
    listByDateRange: vi.fn(),
    listByPatient: vi.fn(),
    getById: vi.fn(),
    listPayments: vi.fn(),
    create: vi.fn(),
    postPaymentAtomic: vi.fn(),
    createPayment: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    restore: vi.fn(),
  },
}));

vi.mock("@/core/events", () => ({
  emitDomainEvent,
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

vi.mock("@/services/security/rateLimit.service", () => ({
  rateLimitService: {
    assertAllowed: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/services/subscription/featureAccess.service", () => ({
  featureAccessService: {
    assertFeatureAccess: vi.fn(),
  },
}));

const buildInvoice = (overrides: Partial<InvoiceRow> = {}): InvoiceRow =>
  invoiceSchema.parse({
    id: invoiceId,
    tenant_id: tenantId,
    patient_id: patientId,
    invoice_code: "INV-100",
    service: "Consultation",
    amount: 120,
    amount_paid: 0,
    balance_due: 120,
    invoice_date: "2026-04-16",
    due_date: "2026-04-20",
    paid_at: null,
    voided_at: null,
    void_reason: null,
    status: "pending",
    deleted_at: null,
    deleted_by: null,
    created_at: "2026-04-16T08:00:00.000Z",
    updated_at: "2026-04-16T08:00:00.000Z",
    ...overrides,
  });

import { billingService } from "@/services/billing/billing.service";

describe("billingService permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    billingAuthExtras.getStateExtras = () => ({});
    emitDomainEvent.mockResolvedValue(undefined);
    vi.mocked(featureAccessService, true).assertFeatureAccess.mockResolvedValue(billingEntitlementSnapshot);
  });

  it("blocks list when lacking billing permissions", async () => {
    billingAuthExtras.getStateExtras = () => ({ hasPermission: () => false });
    await expect(
      billingService.listPaged({ page: 1, pageSize: 10 }),
    ).rejects.toThrow("Not authorized");
  });

  it("blocks billing access when the subscription does not include billing", async () => {
    vi.mocked(featureAccessService, true).assertFeatureAccess.mockRejectedValue(
      new Error("Billing is not available on the current subscription."),
    );

    await expect(
      billingService.listPaged({ page: 1, pageSize: 10 }),
    ).rejects.toThrow("Billing is not available on the current subscription.");

    expect(vi.mocked(billingRepository, true).listPaged).not.toHaveBeenCalled();
  });

  it("creates a pending invoice with derived balances", async () => {
    const repo = vi.mocked(billingRepository, true);
    repo.create.mockResolvedValue(buildInvoice());

    await billingService.create({
      patient_id: patientId,
      invoice_code: "INV-101",
      service: "ECG",
      amount: 120,
      due_date: futureDueDate,
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 120,
        amount_paid: 0,
        balance_due: 120,
        status: "pending",
        due_date: futureDueDate,
      }),
      tenantId,
    );
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("posts a partial payment and keeps the invoice partially paid", async () => {
    const repo = vi.mocked(billingRepository, true);
    repo.getById.mockResolvedValue(buildInvoice());
    repo.postPaymentAtomic.mockResolvedValue({
      result_code: "OK",
      retryable: false,
      idempotency_replay: false,
      message: "Payment posted",
      invoice: buildInvoice({
        amount_paid: 40,
        balance_due: 80,
        status: "partially_paid",
        paid_at: null,
      }),
      payment: {
        id: paymentId,
        tenant_id: tenantId,
        invoice_id: invoiceId,
        patient_id: patientId,
        amount: 40,
        payment_method: "cash",
        paid_at: "2026-04-16T09:00:00.000Z",
        reference: "RCPT-1",
        notes: "Front desk collected cash",
        created_at: "2026-04-16T09:00:00.000Z",
        created_by: userId,
      },
    });

    const result = await billingService.postPayment(invoiceId, {
      amount: 40,
      payment_method: "cash",
      paid_at: "2026-04-16T09:00:00.000Z",
      reference: "RCPT-1",
    });

    expect(repo.postPaymentAtomic).toHaveBeenCalledWith(
      invoiceId,
      expect.objectContaining({
        amount: 40,
        payment_method: "cash",
      }),
      tenantId,
      userId,
      expect.any(Object),
    );
    expect(result.invoice.status).toBe("partially_paid");
    expect(result.invoice.balance_due).toBe(80);
    expect(emitDomainEvent).not.toHaveBeenCalled();
  });

  it("emits InvoicePaid when a posted payment settles the invoice", async () => {
    const repo = vi.mocked(billingRepository, true);
    repo.getById.mockResolvedValue(buildInvoice({
      amount_paid: 30,
      balance_due: 90,
      status: "partially_paid",
    }));
    repo.postPaymentAtomic.mockResolvedValue({
      result_code: "OK",
      retryable: false,
      idempotency_replay: false,
      message: "Payment posted",
      invoice: buildInvoice({
        amount_paid: 120,
        balance_due: 0,
        status: "paid",
        paid_at: "2026-04-16T10:00:00.000Z",
      }),
      payment: {
        id: paymentId,
        tenant_id: tenantId,
        invoice_id: invoiceId,
        patient_id: patientId,
        amount: 90,
        payment_method: "card",
        paid_at: "2026-04-16T10:00:00.000Z",
        reference: "CARD-100",
        notes: null,
        created_at: "2026-04-16T10:00:00.000Z",
        created_by: userId,
      },
    });

    const result = await billingService.postPayment(invoiceId, {
      amount: 90,
      payment_method: "card",
      paid_at: "2026-04-16T10:00:00.000Z",
      reference: "CARD-100",
    });

    expect(result.invoice.status).toBe("paid");
    expect(result.invoice.balance_due).toBe(0);
    expect(emitDomainEvent).not.toHaveBeenCalled();
    expect(repo.postPaymentAtomic).toHaveBeenCalledWith(
      invoiceId,
      expect.objectContaining({ amount: 90 }),
      tenantId,
      userId,
      expect.objectContaining({
        requestTraceId: expect.any(String),
        operationTraceId: expect.any(String),
        workflowTraceId: expect.any(String),
      }),
    );
  });

  it("blocks voiding an invoice that already has posted payments", async () => {
    const repo = vi.mocked(billingRepository, true);
    repo.getById.mockResolvedValue(buildInvoice({
      amount_paid: 10,
      balance_due: 110,
      status: "partially_paid",
    }));

    await expect(
      billingService.update(invoiceId, {
        status: "void",
        void_reason: "Entered for the wrong patient",
      }),
    ).rejects.toThrow("Invoices with posted payments cannot be voided");
  });

  it("voids an unpaid invoice when a reason is provided", async () => {
    const repo = vi.mocked(billingRepository, true);
    repo.getById.mockResolvedValue(buildInvoice({
      status: "pending",
      amount_paid: 0,
      balance_due: 120,
    }));
    repo.update.mockResolvedValue(buildInvoice({
      status: "void",
      amount_paid: 0,
      balance_due: 0,
      void_reason: "Duplicate invoice created at reception",
      voided_at: "2026-04-16T11:00:00.000Z",
    }));

    const result = await billingService.voidInvoice(
      invoiceId,
      "Duplicate invoice created at reception",
    );

    expect(repo.update).toHaveBeenCalledWith(
      invoiceId,
      expect.objectContaining({
        status: "void",
        balance_due: 0,
        void_reason: "Duplicate invoice created at reception",
      }),
      tenantId,
      undefined,
    );
    expect(result.status).toBe("void");
    expect(result.balance_due).toBe(0);
  });
});
