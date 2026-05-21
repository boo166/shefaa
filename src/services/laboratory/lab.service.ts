import { z } from "zod";
import {
  labOrderWithDoctorSchema,
  labOrderWithPatientDoctorSchema,
  labResultCreateSchema,
  labResultListParamsSchema,
  labResultSchema,
  labResultUpdateSchema,
} from "@/domain/lab/lab.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import { statePolicies } from "@/domain/workflows/statePolicies";
import type { LabResultCreateInput, LabResultListParams, LabResultUpdateInput } from "@/domain/lab/lab.types";
import type { LimitOffsetParams } from "@/domain/shared/pagination.types";
import { limitOffsetSchema } from "@/domain/shared/pagination.schema";
import { BusinessRuleError, ConflictError, NotFoundError, toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { assertAnyPermission } from "@/services/supabase/permissions";
import { featureAccessService } from "@/services/subscription/featureAccess.service";
import { rateLimitService } from "@/services/security/rateLimit.service";
import { withAuthStaleGuard } from "@/services/auth/authContextSnapshot";
import { labRepository } from "./lab.repository";

const labStatusCountsSchema = z.object({
  pending: z.number().int().nonnegative(),
  processing: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
});

function buildResultSummary(order: {
  result?: string | null;
  result_value?: string | null;
  result_unit?: string | null;
  reference_range?: string | null;
  abnormal_flag?: string | null;
}) {
  const mainValue = [order.result_value?.trim(), order.result_unit?.trim()].filter(Boolean).join(" ");
  const meta = [order.reference_range?.trim(), order.abnormal_flag?.trim()].filter(Boolean).join(" | ");
  const structuredSummary = [mainValue, meta].filter(Boolean).join(" | ");
  if (structuredSummary) return structuredSummary;
  return order.result?.trim() || null;
}

function hasStructuredResultValue(order: {
  result_value?: string | null;
}) {
  return Boolean(order.result_value?.trim());
}

export const labService = {
  async listPaged(params: LabResultListParams) {
    try {
      assertAnyPermission(["view_medical_records", "manage_medical_records", "manage_laboratory"]);
      await featureAccessService.assertFeatureAccess("laboratory");
      return await withAuthStaleGuard(async () => {
        const parsed = labResultListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await labRepository.listPaged(parsed, tenantId);
        const data = z.array(labResultSchema).parse(result.data);
        const count = z.number().int().nonnegative().parse(result.count);
        return { data, count };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load lab orders");
    }
  },
  async listPagedWithRelations(params: LabResultListParams) {
    try {
      assertAnyPermission(["view_medical_records", "manage_medical_records", "manage_laboratory"]);
      await featureAccessService.assertFeatureAccess("laboratory");
      return await withAuthStaleGuard(async () => {
        const parsed = labResultListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await labRepository.listPagedWithRelations(parsed, tenantId);
        const data = z.array(labOrderWithPatientDoctorSchema).parse(result.data);
        const count = z.number().int().nonnegative().parse(result.count);
        return { data, count };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load lab orders");
    }
  },
  async countByStatus() {
    try {
      assertAnyPermission(["view_medical_records", "manage_medical_records", "manage_laboratory"]);
      await featureAccessService.assertFeatureAccess("laboratory");
      return await withAuthStaleGuard(async () => {
        const { tenantId } = getTenantContext();
        const result = await labRepository.countByStatus(tenantId);
        return labStatusCountsSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load lab order counts");
    }
  },
  async listByPatient(patientId: string, params?: LimitOffsetParams) {
    try {
      assertAnyPermission(["view_medical_records", "manage_medical_records", "manage_laboratory"]);
      await featureAccessService.assertFeatureAccess("laboratory");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(patientId);
        const paging = limitOffsetSchema.parse(params ?? {});
        const { tenantId } = getTenantContext();
        const result = await labRepository.listByPatient(parsedId, tenantId, paging);
        return z.array(labOrderWithDoctorSchema).parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load patient lab orders");
    }
  },
  async create(input: LabResultCreateInput) {
    try {
      assertAnyPermission(["manage_medical_records", "manage_laboratory"]);
      await featureAccessService.assertFeatureAccess("laboratory");
      return await withAuthStaleGuard(async () => {
        const parsed = labResultCreateSchema.parse(input);
        const { tenantId } = getTenantContext();
        const result = await labRepository.create(parsed, tenantId);
        return labResultSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to create lab order");
    }
  },
  async update(id: string, input: LabResultUpdateInput) {
    try {
      assertAnyPermission(["manage_medical_records", "manage_laboratory"]);
      await featureAccessService.assertFeatureAccess("laboratory");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const parsed = labResultUpdateSchema.parse(input);
        const { expected_updated_at, ...updates } = parsed;
        const { tenantId, userId } = getTenantContext();
        const existing = labResultSchema.parse(await labRepository.getById(parsedId, tenantId));
        const merged = {
          ...existing,
          ...updates,
        };

        if (updates.status && !statePolicies.lab.canTransition(existing.status, updates.status)) {
          throw new BusinessRuleError(`Cannot move lab order from ${existing.status} to ${updates.status}`, {
            code: "LAB_STATUS_TRANSITION_INVALID",
            details: { currentStatus: existing.status, nextStatus: updates.status },
          });
        }

        if (updates.status === "completed" && !hasStructuredResultValue(merged)) {
          throw new BusinessRuleError("Completed lab results must include a structured result entry", {
            code: "LAB_RESULT_REQUIRED_FOR_COMPLETION",
          });
        }

        const normalizedUpdate: LabResultUpdateInput = {
          ...updates,
        };
        const computedSummary = buildResultSummary(merged);
        if (computedSummary) {
          normalizedUpdate.result = computedSummary;
        }
        if (updates.status === "completed" && existing.status !== "completed" && normalizedUpdate.resulted_at === undefined) {
          normalizedUpdate.resulted_at = new Date().toISOString();
        }

        const shouldRateLimit = hasStructuredResultValue(merged) && (
          updates.result !== undefined ||
          updates.result_value !== undefined ||
          updates.result_unit !== undefined ||
          updates.reference_range !== undefined ||
          updates.abnormal_flag !== undefined ||
          updates.result_notes !== undefined ||
          updates.status === "completed"
        );
        if (shouldRateLimit) {
          await rateLimitService.assertAllowed("lab_upload", [tenantId, userId]);
        }

        const shouldUseFinalizeCommand =
          updates.status === "completed" ||
          updates.result !== undefined ||
          updates.result_value !== undefined ||
          updates.result_unit !== undefined ||
          updates.reference_range !== undefined ||
          updates.abnormal_flag !== undefined ||
          updates.result_notes !== undefined;

        const result = shouldUseFinalizeCommand
          ? await labRepository.finalizeResult(parsedId, normalizedUpdate, tenantId, userId, expected_updated_at)
          : await labRepository.update(parsedId, normalizedUpdate, tenantId, expected_updated_at);
        if (!result) {
          if (expected_updated_at) {
            throw new ConflictError("Lab order was modified by another user", {
              code: "CONCURRENT_UPDATE",
            });
          }
          throw new NotFoundError("Lab order not found");
        }
        return labResultSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to update lab order");
    }
  },
  async archive(id: string) {
    try {
      assertAnyPermission(["manage_medical_records", "manage_laboratory"]);
      await featureAccessService.assertFeatureAccess("laboratory");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId, userId } = getTenantContext();
        const result = await labRepository.archive(parsedId, tenantId, userId);
        return labResultSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to archive lab order");
    }
  },
  async restore(id: string) {
    try {
      assertAnyPermission(["manage_medical_records", "manage_laboratory"]);
      await featureAccessService.assertFeatureAccess("laboratory");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId } = getTenantContext();
        const result = await labRepository.restore(parsedId, tenantId);
        return labResultSchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to restore lab order");
    }
  },
};
