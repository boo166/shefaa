import { z } from "zod";
import {
  procurementListParamsSchema,
  inventoryMovementSchema,
  medicationBatchSchema,
  purchaseOrderCreateSchema,
  purchaseOrderSchema,
  purchaseOrderUpdateSchema,
  stockReceiptCreateSchema,
  stockReceiptSchema,
  supplierCreateSchema,
  supplierSchema,
  supplierUpdateSchema,
} from "@/domain/procurement/procurement.schema";
import type {
  ProcurementListParams,
  PurchaseOrderCreateInput,
  PurchaseOrderUpdateInput,
  StockReceiptCreateInput,
  SupplierCreateInput,
  SupplierUpdateInput,
} from "@/domain/procurement/procurement.types";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import { assertAnyPermission } from "@/services/supabase/permissions";
import { featureAccessService } from "@/services/subscription/featureAccess.service";
import { BusinessRuleError, ConflictError, NotFoundError, toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { withAuthStaleGuard } from "@/services/auth/authContextSnapshot";
import { procurementRepository } from "./procurement.repository";

function assertManageProcurement() {
  assertAnyPermission(["manage_pharmacy"]);
}

export const procurementService = {
  async listSuppliers(params: ProcurementListParams) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsed = procurementListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await procurementRepository.listSuppliers(parsed, tenantId);
        return {
          data: z.array(supplierSchema).parse(result.data),
          count: z.number().int().nonnegative().parse(result.count),
        };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load suppliers");
    }
  },

  async createSupplier(input: SupplierCreateInput) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsed = supplierCreateSchema.parse(input);
        const { tenantId } = getTenantContext();
        return supplierSchema.parse(await procurementRepository.createSupplier(parsed, tenantId));
      });
    } catch (err) {
      throw toServiceError(err, "Failed to create supplier");
    }
  },

  async updateSupplier(id: string, input: SupplierUpdateInput) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const parsed = supplierUpdateSchema.parse(input);
        const { expected_updated_at, ...updates } = parsed;
        const { tenantId } = getTenantContext();
        const result = await procurementRepository.updateSupplier(parsedId, updates, tenantId, expected_updated_at);
        if (!result) {
          if (expected_updated_at) {
            throw new ConflictError("Supplier was modified by another user", { code: "CONCURRENT_UPDATE" });
          }
          throw new NotFoundError("Supplier not found");
        }
        return supplierSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to update supplier");
    }
  },

  async archiveSupplier(id: string) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId, userId } = getTenantContext();
        return supplierSchema.parse(await procurementRepository.archiveSupplier(parsedId, tenantId, userId ?? null));
      });
    } catch (err) {
      throw toServiceError(err, "Failed to archive supplier");
    }
  },

  async restoreSupplier(id: string) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId } = getTenantContext();
        return supplierSchema.parse(await procurementRepository.restoreSupplier(parsedId, tenantId));
      });
    } catch (err) {
      throw toServiceError(err, "Failed to restore supplier");
    }
  },

  async listPurchaseOrders(params: ProcurementListParams) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsed = procurementListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await procurementRepository.listPurchaseOrders(parsed, tenantId);
        return {
          data: z.array(purchaseOrderSchema).parse(result.data),
          count: z.number().int().nonnegative().parse(result.count),
        };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load purchase orders");
    }
  },

  async createPurchaseOrder(input: PurchaseOrderCreateInput) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsed = purchaseOrderCreateSchema.parse(input);
        if (parsed.status === "received" || parsed.status === "cancelled") {
          throw new BusinessRuleError("New purchase orders must start in draft or submitted status", {
            code: "PURCHASE_ORDER_INVALID_INITIAL_STATUS",
          });
        }
        const { tenantId } = getTenantContext();
        return purchaseOrderSchema.parse(await procurementRepository.createPurchaseOrder(parsed, tenantId));
      });
    } catch (err) {
      throw toServiceError(err, "Failed to create purchase order");
    }
  },

  async updatePurchaseOrder(id: string, input: PurchaseOrderUpdateInput) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const parsed = purchaseOrderUpdateSchema.parse(input);
        const { expected_updated_at, ...updates } = parsed;
        const { tenantId } = getTenantContext();
        const result = await procurementRepository.updatePurchaseOrder(parsedId, updates, tenantId, expected_updated_at);
        if (!result) {
          if (expected_updated_at) {
            throw new ConflictError("Purchase order was modified by another user", { code: "CONCURRENT_UPDATE" });
          }
          throw new NotFoundError("Purchase order not found");
        }
        return purchaseOrderSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to update purchase order");
    }
  },

  async submitPurchaseOrder(id: string, expectedUpdatedAt?: string) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId } = getTenantContext();
        const result = await procurementRepository.submitPurchaseOrder(parsedId, tenantId, expectedUpdatedAt);
        if (!result) {
          if (expectedUpdatedAt) {
            throw new ConflictError("Purchase order was modified by another user", { code: "CONCURRENT_UPDATE" });
          }
          throw new NotFoundError("Purchase order not found");
        }
        return purchaseOrderSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to submit purchase order");
    }
  },

  async cancelPurchaseOrder(id: string, expectedUpdatedAt?: string) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId } = getTenantContext();
        const result = await procurementRepository.cancelPurchaseOrder(parsedId, tenantId, expectedUpdatedAt);
        if (!result) {
          if (expectedUpdatedAt) {
            throw new ConflictError("Purchase order was modified by another user", { code: "CONCURRENT_UPDATE" });
          }
          throw new NotFoundError("Purchase order not found");
        }
        return purchaseOrderSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to cancel purchase order");
    }
  },

  async receiveStock(input: StockReceiptCreateInput) {
    try {
      assertManageProcurement();
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsed = stockReceiptCreateSchema.parse(input);
        const { tenantId, userId } = getTenantContext();
        const result = await procurementRepository.receiveStock(parsed, tenantId, userId ?? null);
        return {
          ...result,
          purchase_order: purchaseOrderSchema.parse(result.purchase_order),
          stock_receipt: stockReceiptSchema.parse(result.stock_receipt),
          medication_batch: medicationBatchSchema.parse(result.medication_batch),
          inventory_movement: inventoryMovementSchema.parse(result.inventory_movement),
        };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to receive procurement stock");
    }
  },
};
