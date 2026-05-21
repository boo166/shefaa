import { z } from "zod";
import { dateStringSchema, dateTimeStringSchema } from "../shared/date.schema";
import { uuidSchema } from "../shared/identifiers.schema";
import { listParamsSchema } from "../shared/pagination.schema";

export const supplierStatusEnum = z.enum(["active", "inactive"]);
export const purchaseOrderStatusEnum = z.enum(["draft", "submitted", "received", "cancelled"]);
export const inventoryMovementTypeEnum = z.enum(["receipt", "dispense", "adjustment", "transfer"]);

export const supplierSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  name: z.string().trim().min(1).max(200),
  contact_name: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(50).optional().nullable(),
  email: z.string().trim().email().optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  status: supplierStatusEnum,
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const supplierCreateSchema = supplierSchema
  .omit({
    id: true,
    tenant_id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    contact_name: z.string().trim().max(200).optional().nullable(),
    phone: z.string().trim().max(50).optional().nullable(),
    email: z.string().trim().email().optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
    status: supplierStatusEnum.optional(),
  });

export const supplierUpdateSchema = supplierCreateSchema.partial().extend({
  expected_updated_at: dateTimeStringSchema.optional(),
});

export const purchaseOrderItemSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  purchase_order_id: uuidSchema,
  medication_id: uuidSchema,
  quantity: z.coerce.number().int().positive(),
  unit_cost: z.coerce.number().min(0),
  total_cost: z.coerce.number().min(0),
  created_at: dateTimeStringSchema,
});

export const purchaseOrderItemInputSchema = z.object({
  medication_id: uuidSchema,
  quantity: z.coerce.number().int().positive(),
  unit_cost: z.coerce.number().min(0),
});

export const purchaseOrderSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  supplier_id: uuidSchema,
  status: purchaseOrderStatusEnum,
  order_date: dateStringSchema,
  total_amount: z.coerce.number().min(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const purchaseOrderCreateSchema = z.object({
  supplier_id: uuidSchema,
  status: purchaseOrderStatusEnum.optional(),
  order_date: dateStringSchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(purchaseOrderItemInputSchema).min(1),
});

export const purchaseOrderUpdateSchema = z.object({
  order_date: dateStringSchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  expected_updated_at: dateTimeStringSchema.optional(),
});

export const stockReceiptSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  purchase_order_id: uuidSchema,
  received_at: dateTimeStringSchema,
  received_by: uuidSchema.optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  created_at: dateTimeStringSchema,
});

export const medicationBatchSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  medication_id: uuidSchema,
  supplier_id: uuidSchema.optional().nullable(),
  lot_number: z.string().trim().min(1).max(120),
  expiry_date: dateStringSchema.optional().nullable(),
  quantity: z.coerce.number().int().min(0),
  cost_price: z.coerce.number().min(0),
  received_at: dateTimeStringSchema,
  created_at: dateTimeStringSchema,
});

export const inventoryMovementSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  medication_id: uuidSchema,
  batch_id: uuidSchema.optional().nullable(),
  movement_type: inventoryMovementTypeEnum,
  quantity: z.coerce.number().int(),
  source_reference: z.string().trim().optional().nullable(),
  created_at: dateTimeStringSchema,
});

export const stockReceiptCreateSchema = z.object({
  purchase_order_id: uuidSchema,
  purchase_order_item_id: uuidSchema,
  quantity: z.coerce.number().int().positive(),
  lot_number: z.string().trim().min(1).max(120),
  expiry_date: dateStringSchema.optional().nullable(),
  received_at: dateTimeStringSchema.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const procurementListParamsSchema = listParamsSchema;
