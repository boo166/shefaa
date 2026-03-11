import { z } from "zod";

export const clinicSlugCheckInputSchema = z.object({
  clinicName: z.string().trim().min(2).max(120),
  customSlug: z.string().trim().min(2).max(80).optional(),
});

export const clinicSlugCheckResultSchema = z.object({
  available: z.boolean(),
  slug: z.string().trim().min(2).optional().nullable(),
  suggestions: z.array(z.string().trim().min(2)).optional().nullable(),
  error: z.string().trim().min(1).optional().nullable(),
});
