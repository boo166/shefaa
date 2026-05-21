import { beforeEach, describe, expect, it, vi } from "vitest";
import { procurementRepository } from "@/services/procurement/procurement.repository";

const tenantId = "00000000-0000-0000-0000-000000000111";
const userId = "00000000-0000-0000-0000-000000000222";
const supplierId = "00000000-0000-0000-0000-000000000333";
const purchaseOrderId = "00000000-0000-0000-0000-000000000444";
const purchaseOrderItemId = "00000000-0000-0000-0000-000000000445";
const medicationId = "00000000-0000-0000-0000-000000000555";

vi.mock("@/services/procurement/procurement.repository", () => ({
  procurementRepository: {
    listSuppliers: vi.fn(),
    createSupplier: vi.fn(),
    updateSupplier: vi.fn(),
    archiveSupplier: vi.fn(),
    restoreSupplier: vi.fn(),
    listPurchaseOrders: vi.fn(),
    createPurchaseOrder: vi.fn(),
    updatePurchaseOrder: vi.fn(),
    submitPurchaseOrder: vi.fn(),
    cancelPurchaseOrder: vi.fn(),
    receiveStock: vi.fn(),
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

const buildSupplier = (overrides: Record<string, unknown> = {}) => ({
  id: supplierId,
  tenant_id: tenantId,
  name: "Domain Supplier",
  contact_name: "Procurement Lead",
  phone: "+201000000000",
  email: "supplier@test.com",
  address: "Main warehouse",
  status: "active",
  created_at: "2026-05-21T08:00:00.000Z",
  updated_at: "2026-05-21T08:00:00.000Z",
  ...overrides,
});

const buildPurchaseOrder = (overrides: Record<string, unknown> = {}) => ({
  id: purchaseOrderId,
  tenant_id: tenantId,
  supplier_id: supplierId,
  status: "submitted",
  order_date: "2026-05-21",
  total_amount: 90,
  notes: "replenishment",
  created_at: "2026-05-21T08:00:00.000Z",
  updated_at: "2026-05-21T08:00:00.000Z",
  ...overrides,
});

const buildReceiptResult = () => ({
  purchase_order: buildPurchaseOrder({ status: "received" }),
  stock_receipt: {
    id: "00000000-0000-0000-0000-000000000666",
    tenant_id: tenantId,
    purchase_order_id: purchaseOrderId,
    received_at: "2026-05-21T09:00:00.000Z",
    received_by: userId,
    notes: "received",
    created_at: "2026-05-21T09:00:00.000Z",
  },
  medication_batch: {
    id: "00000000-0000-0000-0000-000000000777",
    tenant_id: tenantId,
    medication_id: medicationId,
    supplier_id: supplierId,
    lot_number: "LOT-001",
    expiry_date: "2027-01-01",
    quantity: 12,
    cost_price: 7.5,
    received_at: "2026-05-21T09:00:00.000Z",
    created_at: "2026-05-21T09:00:00.000Z",
  },
  inventory_movement: {
    id: "00000000-0000-0000-0000-000000000888",
    tenant_id: tenantId,
    medication_id: medicationId,
    batch_id: "00000000-0000-0000-0000-000000000777",
    movement_type: "receipt",
    quantity: 12,
    source_reference: "purchase_order:po:item:poi:receipt:receipt",
    created_at: "2026-05-21T09:00:00.000Z",
  },
  medication: {},
});

describe("procurementService operational authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("creates suppliers through the command repository", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(procurementRepository, true);
    repo.createSupplier.mockResolvedValue(buildSupplier() as any);

    const { procurementService } = await import("@/services/procurement/procurement.service");

    const result = await procurementService.createSupplier({
      name: "Domain Supplier",
      email: "supplier@test.com",
    });

    expect(repo.createSupplier).toHaveBeenCalledWith({
      name: "Domain Supplier",
      email: "supplier@test.com",
    }, tenantId);
    expect(result.id).toBe(supplierId);
  });

  it("maps stale supplier command responses to conflict errors", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(procurementRepository, true);
    repo.updateSupplier.mockResolvedValue(null);

    const { procurementService } = await import("@/services/procurement/procurement.service");

    await expect(procurementService.updateSupplier(supplierId, {
      name: "Updated Supplier",
      expected_updated_at: "2026-05-20T08:00:00.000Z",
    })).rejects.toMatchObject({ code: "CONCURRENT_UPDATE" });
  });

  it("rejects impossible purchase order initial states before repository access", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(procurementRepository, true);

    const { procurementService } = await import("@/services/procurement/procurement.service");

    await expect(procurementService.createPurchaseOrder({
      supplier_id: supplierId,
      status: "received",
      items: [{ medication_id: medicationId, quantity: 12, unit_cost: 7.5 }],
    } as any)).rejects.toMatchObject({ code: "PURCHASE_ORDER_INVALID_INITIAL_STATUS" });
    expect(repo.createPurchaseOrder).not.toHaveBeenCalled();
  });

  it("receives stock through the procurement receipt command", async () => {
    vi.doMock("@/core/auth/authStore", () => ({
      useAuth: {
        getState: () => ({ hasPermission: () => true }),
      },
    }));
    const repo = vi.mocked(procurementRepository, true);
    repo.receiveStock.mockResolvedValue(buildReceiptResult() as any);

    const { procurementService } = await import("@/services/procurement/procurement.service");

    const result = await procurementService.receiveStock({
      purchase_order_id: purchaseOrderId,
      purchase_order_item_id: purchaseOrderItemId,
      quantity: 12,
      lot_number: "LOT-001",
      expiry_date: "2027-01-01",
      received_at: "2026-05-21T09:00:00.000Z",
      notes: "received",
    });

    expect(repo.receiveStock).toHaveBeenCalledWith({
      purchase_order_id: purchaseOrderId,
      purchase_order_item_id: purchaseOrderItemId,
      quantity: 12,
      lot_number: "LOT-001",
      expiry_date: "2027-01-01",
      received_at: "2026-05-21T09:00:00.000Z",
      notes: "received",
    }, tenantId, userId);
    expect(result.purchase_order.status).toBe("received");
    expect(result.stock_receipt.purchase_order_id).toBe(purchaseOrderId);
  });
});
