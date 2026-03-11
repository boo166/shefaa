import type { z } from "zod";
import {
  clinicSlugCheckInputSchema,
  clinicSlugCheckResultSchema,
} from "./clinicSlug.schema";

export type ClinicSlugCheckInput = z.infer<typeof clinicSlugCheckInputSchema>;
export type ClinicSlugCheckResult = z.infer<typeof clinicSlugCheckResultSchema>;
