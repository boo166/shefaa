import { z } from "zod";
import {
  insuranceClaimCreateSchema,
  insuranceClaimListParamsSchema,
  insuranceClaimSchema,
  insuranceClaimUpdateSchema,
  insuranceClaimWithPatientSchema,
  insuranceAssignableOwnerSchema,
  insuranceOperationsSummarySchema,
  insuranceSummarySchema,
} from "@/domain/insurance/insurance.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import { statePolicies } from "@/domain/workflows/statePolicies";
import type {
  InsuranceClaim,
  InsuranceClaimCreateInput,
  InsuranceClaimListParams,
  InsuranceClaimUpdateInput,
} from "@/domain/insurance/insurance.types";
import { assertAnyPermission } from "@/services/supabase/permissions";
import { featureAccessService } from "@/services/subscription/featureAccess.service";
import { BusinessRuleError, ConflictError, NotFoundError, toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { auditLogService } from "@/services/settings/audit.service";
import { withAuthStaleGuard } from "@/services/auth/authContextSnapshot";
import { insuranceRepository } from "./insurance.repository";

function assertClaimTransition(current: InsuranceClaim["status"], next: InsuranceClaim["status"]) {
  if (current === next) return;
  if (!statePolicies.insurance.canTransition(current, next)) {
    throw new BusinessRuleError(`Invalid insurance claim status transition: ${current} -> ${next}`, {
      code: "INSURANCE_CLAIM_INVALID_TRANSITION",
      details: { currentStatus: current, nextStatus: next },
    });
  }
}

export const insuranceService = {
  async assertAssignableOwner(userId: string | null | undefined, tenantId: string) {
    if (!userId) return;
    const parsedOwnerId = uuidSchema.parse(userId);
    const isAllowed = await insuranceRepository.isAssignableOwner(parsedOwnerId, tenantId);
    if (!isAllowed) {
      throw new BusinessRuleError("Insurance claim assignee must be an accountant or clinic admin in the same tenant", {
        code: "INSURANCE_CLAIM_ASSIGNEE_INVALID",
      });
    }
  },
  async listPaged(params: InsuranceClaimListParams) {
    try {
      assertAnyPermission(["view_billing", "manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const parsed = insuranceClaimListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await insuranceRepository.listPaged(parsed, tenantId);
        const data = z.array(insuranceClaimSchema).parse(result.data);
        const count = z.number().int().nonnegative().parse(result.count);
        return { data, count };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load insurance claims");
    }
  },
  async listPagedWithRelations(params: InsuranceClaimListParams) {
    try {
      assertAnyPermission(["view_billing", "manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const parsed = insuranceClaimListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await insuranceRepository.listPagedWithRelations(parsed, tenantId);
        const data = z.array(insuranceClaimWithPatientSchema).parse(result.data);
        const count = z.number().int().nonnegative().parse(result.count);
        return { data, count };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load insurance claims");
    }
  },
  async getSummary() {
    try {
      assertAnyPermission(["view_billing", "manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const { tenantId } = getTenantContext();
        const result = await insuranceRepository.getSummary(tenantId);
        return insuranceSummarySchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load insurance summary");
    }
  },
  async getOperationsSummary() {
    try {
      assertAnyPermission(["view_billing", "manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const { tenantId } = getTenantContext();
        const result = await insuranceRepository.getOperationsSummary(tenantId);
        return insuranceOperationsSummarySchema.parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load insurance operations summary");
    }
  },
  async listAssignableOwners() {
    try {
      assertAnyPermission(["view_billing", "manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const { tenantId } = getTenantContext();
        const result = await insuranceRepository.listAssignableOwners(tenantId);
        return z.array(insuranceAssignableOwnerSchema).parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load insurance claim owners");
    }
  },
  async create(input: InsuranceClaimCreateInput) {
    try {
      assertAnyPermission(["manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const parsed = insuranceClaimCreateSchema.parse(input);
        const { tenantId, userId } = getTenantContext();
        const now = new Date().toISOString();
        const status = parsed.status ?? "draft";

        if (status === "approved" || status === "denied" || status === "reimbursed") {
          throw new BusinessRuleError("New insurance claims must start in draft or submitted status", {
            code: "INSURANCE_CLAIM_INVALID_INITIAL_STATUS",
          });
        }

        await insuranceService.assertAssignableOwner(parsed.assigned_to_user_id, tenantId);

        const result = await insuranceRepository.create({
          ...parsed,
          status,
          submitted_at: status === "submitted" ? parsed.submitted_at ?? now : null,
          processing_started_at: null,
          approved_at: null,
          reimbursed_at: null,
          denial_reason: null,
          assigned_to_user_id: parsed.assigned_to_user_id ?? null,
          internal_notes: parsed.internal_notes?.trim() || null,
          payer_notes: parsed.payer_notes?.trim() || null,
          last_follow_up_at: parsed.last_follow_up_at ?? null,
          next_follow_up_at: parsed.next_follow_up_at ?? null,
          resubmission_count: parsed.resubmission_count ?? 0,
        }, tenantId);
        const claim = insuranceClaimSchema.parse(result);

        await auditLogService.logEvent({
          tenant_id: tenantId,
          user_id: userId,
          action: "insurance_claim_created",
          action_type: "insurance_claim_create",
          entity_type: "insurance_claim",
          entity_id: claim.id,
          details: {
            patient_id: claim.patient_id,
            provider: claim.provider,
            amount: claim.amount,
            status: claim.status,
          },
        });

        return claim;
      });
    } catch (err) {
      throw toServiceError(err, "Failed to create insurance claim");
    }
  },
  async update(id: string, input: InsuranceClaimUpdateInput) {
    try {
      assertAnyPermission(["manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const parsed = insuranceClaimUpdateSchema.parse(input);
        const { expected_updated_at, ...updatesInput } = parsed;
        const { tenantId, userId } = getTenantContext();
        const current = insuranceClaimSchema.parse(await insuranceRepository.getById(parsedId, tenantId));
        const updates: InsuranceClaimUpdateInput = { ...updatesInput };

        if (updates.status) {
          assertClaimTransition(current.status, updates.status);

          const now = new Date().toISOString();

          if (updates.status === "draft" && current.status === "denied") {
            updates.resubmission_count = current.resubmission_count + 1;
            updates.submitted_at = null;
            updates.processing_started_at = null;
            updates.approved_at = null;
            updates.reimbursed_at = null;
          }

          if (updates.status === "submitted") {
            updates.submitted_at = updates.submitted_at ?? current.submitted_at ?? now;
            updates.denial_reason = null;
            updates.next_follow_up_at = null;
          }

          if (updates.status === "processing") {
            updates.processing_started_at = updates.processing_started_at ?? current.processing_started_at ?? now;
            updates.denial_reason = null;
          }

          if (updates.status === "approved") {
            updates.approved_at = updates.approved_at ?? current.approved_at ?? now;
            updates.denial_reason = null;
          }

          if (updates.status === "denied") {
            const denialReason = updates.denial_reason?.trim();
            if (!denialReason) {
              throw new BusinessRuleError("Denied claims require a denial reason", {
                code: "INSURANCE_CLAIM_DENIAL_REASON_REQUIRED",
              });
            }
            updates.denial_reason = denialReason;
            updates.approved_at = null;
            updates.reimbursed_at = null;
          }

          if (updates.status === "reimbursed") {
            const payerReference = updates.payer_reference?.trim() ?? current.payer_reference?.trim();
            if (!payerReference) {
              throw new BusinessRuleError("Reimbursed claims require a payer reference", {
                code: "INSURANCE_CLAIM_PAYER_REFERENCE_REQUIRED",
              });
            }
            updates.payer_reference = payerReference;
            updates.reimbursed_at = updates.reimbursed_at ?? current.reimbursed_at ?? now;
            updates.denial_reason = null;
          }
        }

        if (updates.internal_notes !== undefined) {
          updates.internal_notes = updates.internal_notes?.trim() || null;
        }

        if (updates.payer_notes !== undefined) {
          updates.payer_notes = updates.payer_notes?.trim() || null;
        }

        if (updates.assigned_to_user_id !== undefined) {
          await insuranceService.assertAssignableOwner(updates.assigned_to_user_id, tenantId);
        }

        const result = updates.status
          ? await insuranceRepository.transitionStatus(parsedId, updates, tenantId, userId, expected_updated_at)
          : await insuranceRepository.update(parsedId, updates, tenantId, expected_updated_at);
        if (!result) {
          if (expected_updated_at) {
            throw new ConflictError("Insurance claim was modified by another user", {
              code: "CONCURRENT_UPDATE",
            });
          }
          throw new NotFoundError("Insurance claim not found");
        }
        const claim = insuranceClaimSchema.parse(result);

        if (!updates.status) {
          await auditLogService.logEvent({
            tenant_id: tenantId,
            user_id: userId,
            action: "insurance_claim_updated",
            action_type: "insurance_claim_update",
            entity_type: "insurance_claim",
            entity_id: claim.id,
            details: updates as Record<string, unknown>,
          });
        }

        return claim;
      });
    } catch (err) {
      throw toServiceError(err, "Failed to update insurance claim");
    }
  },
  async archive(id: string) {
    try {
      assertAnyPermission(["manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId, userId } = getTenantContext();
        const result = await insuranceRepository.archive(parsedId, tenantId, userId);
        const claim = insuranceClaimSchema.parse(result);
        await auditLogService.logEvent({
          tenant_id: tenantId,
          user_id: userId,
          action: "insurance_claim_archived",
          action_type: "insurance_claim_archive",
          entity_type: "insurance_claim",
          entity_id: claim.id,
        });
        return claim;
      });
    } catch (err) {
      throw toServiceError(err, "Failed to archive insurance claim");
    }
  },
  async restore(id: string) {
    try {
      assertAnyPermission(["manage_billing"]);
      await featureAccessService.assertFeatureAccess("insurance");
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId, userId } = getTenantContext();
        const result = await insuranceRepository.restore(parsedId, tenantId);
        const claim = insuranceClaimSchema.parse(result);
        await auditLogService.logEvent({
          tenant_id: tenantId,
          user_id: userId,
          action: "insurance_claim_restored",
          action_type: "insurance_claim_restore",
          entity_type: "insurance_claim",
          entity_id: claim.id,
        });
        return claim;
      });
    } catch (err) {
      throw toServiceError(err, "Failed to restore insurance claim");
    }
  },
};
