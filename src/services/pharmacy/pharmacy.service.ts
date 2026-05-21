import { z } from "zod";
import {
  medicationCreateSchema,
  medicationListParamsSchema,
  medicationSchema,
  medicationSummarySchema,
  medicationUpdateSchema,
} from "@/domain/pharmacy/medication.schema";
import { statePolicies } from "@/domain/workflows/statePolicies";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type {
  MedicationCreateInput,
  MedicationListParams,
  MedicationUpdateInput,
} from "@/domain/pharmacy/medication.types";
import { assertAnyPermission } from "@/services/supabase/permissions";
import { featureAccessService } from "@/services/subscription/featureAccess.service";
import { ConflictError, NotFoundError, toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { withAuthStaleGuard } from "@/services/auth/authContextSnapshot";
import { pharmacyRepository } from "./pharmacy.repository";

export const pharmacyService = {
  async listPaged(params: MedicationListParams) {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsed = medicationListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await pharmacyRepository.listPaged(parsed, tenantId);
        const data = z.array(medicationSchema).parse(result.data);
        const count = z.number().int().nonnegative().parse(result.count);
        return { data, count };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load medications");
    }
  },
  async getSummary() {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const { tenantId } = getTenantContext();
        const result = await pharmacyRepository.getSummary(tenantId);
        return medicationSummarySchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load medication summary");
    }
  },
  async create(input: MedicationCreateInput) {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsed = medicationCreateSchema.parse(input);
        const { tenantId } = getTenantContext();
        const result = await pharmacyRepository.create(parsed, tenantId);
        return medicationSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to create medication");
    }
  },
  async update(id: string, input: MedicationUpdateInput) {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const parsed = medicationUpdateSchema.parse(input);
        const { expected_updated_at, ...updates } = parsed;
        const { tenantId } = getTenantContext();
        const normalized = { ...updates };
        if (normalized.stock !== undefined && normalized.status === undefined) {
          normalized.status = statePolicies.pharmacy.deriveStatusFromStock(normalized.stock);
        }
        const result = await pharmacyRepository.update(parsedId, normalized, tenantId, expected_updated_at);
        if (!result) {
          if (expected_updated_at) {
            throw new ConflictError("Medication was modified by another user", { code: "CONCURRENT_UPDATE" });
          }
          throw new NotFoundError("Medication not found");
        }
        return medicationSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to update medication");
    }
  },
  async remove(id: string) {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId } = getTenantContext();
        await pharmacyRepository.remove(parsedId, tenantId);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to delete medication");
    }
  },
};
