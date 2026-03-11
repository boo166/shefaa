import { z } from "zod";

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listParamsSchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
  filters: z.record(z.unknown()).optional(),
  sort: z
    .object({
      column: z.string().min(1),
      ascending: z.boolean().optional(),
    })
    .optional(),
});
