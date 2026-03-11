import { clinicSlugCheckInputSchema, clinicSlugCheckResultSchema } from "@/domain/auth/clinicSlug.schema";
import type { ClinicSlugCheckInput } from "@/domain/auth/clinicSlug.types";
import { toServiceError } from "@/services/supabase/errors";
import { clinicSlugRepository } from "./clinicSlug.repository";

export const clinicSlugService = {
  async checkSlug(input: ClinicSlugCheckInput) {
    try {
      const parsed = clinicSlugCheckInputSchema.parse(input);
      const result = await clinicSlugRepository.checkSlug(parsed);
      return clinicSlugCheckResultSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to check clinic slug");
    }
  },
};
