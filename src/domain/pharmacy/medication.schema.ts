import { z } from "zod";
import { dateTimeStringSchema } from "../shared/date.schema";
import { listParamsSchema } from "../shared/pagination.schema";
import { uuidSchema } from "../shared/identifiers.schema";

export const medicationStatusEnum = z.enum(["in_stock", "low_stock", "out_of_stock"]);

export const medicationSchema = z.object({
  id: uuidSchema,
  tenant_id: uuidSchema,
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120).optional().nullable(),
  stock: z.coerce.number().int().min(0),
  unit: z.string().trim().min(1).max(40),
  price: z.coerce.number().min(0),
  status: medicationStatusEnum,
  created_at: dateTimeStringSchema,
  updated_at: dateTimeStringSchema,
});

export const medicationCreateSchema = medicationSchema
  .omit({
    id: true,
    tenant_id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    category: z.string().trim().min(1).max(120).optional().nullable(),
    stock: z.coerce.number().int().min(0).optional(),
    unit: z.string().trim().min(1).max(40).optional(),
    price: z.coerce.number().min(0).optional(),
    status: medicationStatusEnum.optional(),
  });

export const medicationUpdateSchema = medicationCreateSchema.partial();

export const medicationListParamsSchema = listParamsSchema;

export const medicationSummarySchema = z.object({
  total_count: z.coerce.number().int().min(0),
  low_stock_count: z.coerce.number().int().min(0),
  inventory_value: z.coerce.number().min(0),
});
