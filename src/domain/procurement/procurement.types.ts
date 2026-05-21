import type { z } from "zod";
import {
  inventoryMovementSchema,
  medicationBatchSchema,
  procurementListParamsSchema,
  purchaseOrderCreateSchema,
  purchaseOrderItemInputSchema,
  purchaseOrderItemSchema,
  purchaseOrderSchema,
  purchaseOrderUpdateSchema,
  stockReceiptCreateSchema,
  stockReceiptSchema,
  supplierCreateSchema,
  supplierSchema,
  supplierUpdateSchema,
} from "./procurement.schema";

export type Supplier = z.infer<typeof supplierSchema>;
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;
export type PurchaseOrderItem = z.infer<typeof purchaseOrderItemSchema>;
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>;
export type PurchaseOrderCreateInput = z.infer<typeof purchaseOrderCreateSchema>;
export type PurchaseOrderUpdateInput = z.infer<typeof purchaseOrderUpdateSchema>;
export type StockReceipt = z.infer<typeof stockReceiptSchema>;
export type MedicationBatch = z.infer<typeof medicationBatchSchema>;
export type InventoryMovement = z.infer<typeof inventoryMovementSchema>;
export type StockReceiptCreateInput = z.infer<typeof stockReceiptCreateSchema>;
export type ProcurementListParams = z.infer<typeof procurementListParamsSchema>;

export interface ProcurementReceiptResult {
  purchase_order: PurchaseOrder;
  stock_receipt: StockReceipt;
  medication_batch: MedicationBatch;
  inventory_movement: InventoryMovement;
  medication: unknown;
}
