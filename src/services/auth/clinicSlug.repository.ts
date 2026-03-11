import type { ClinicSlugCheckInput, ClinicSlugCheckResult } from "@/domain/auth/clinicSlug.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

export interface ClinicSlugRepository {
  checkSlug(input: ClinicSlugCheckInput): Promise<ClinicSlugCheckResult>;
}

export const clinicSlugRepository: ClinicSlugRepository = {
  async checkSlug(input) {
    const body: Record<string, string> = {
      clinicName: input.clinicName,
    };

    if (input.customSlug) {
      body.customSlug = input.customSlug;
    }

    const { data, error } = await supabase.functions.invoke("check-slug", { body });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to check clinic slug", {
        code: error.code,
        details: error,
      });
    }

    return data as ClinicSlugCheckResult;
  },
};
