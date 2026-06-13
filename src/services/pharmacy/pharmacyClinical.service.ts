import { uuidSchema } from "@/domain/shared/identifiers.schema";
import { assertAnyPermission } from "@/services/supabase/permissions";
import { featureAccessService } from "@/services/subscription/featureAccess.service";
import { getTenantContext } from "@/services/supabase/tenant";
import { toServiceError } from "@/services/supabase/errors";
import { pharmacyClinicalRepository } from "./pharmacyClinical.repository";

export const pharmacyClinicalService = {
  async reserve(medicationId: string, quantity: number) {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      const parsedId = uuidSchema.parse(medicationId);
      const { tenantId, userId } = getTenantContext();
      return await pharmacyClinicalRepository.reserve({
        medicationId: parsedId,
        tenantId,
        quantity,
        userId,
      });
    } catch (err) {
      throw toServiceError(err, "Failed to reserve medication");
    }
  },

  async release(reservationId: string) {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      const parsedId = uuidSchema.parse(reservationId);
      const { tenantId, userId } = getTenantContext();
      return await pharmacyClinicalRepository.release({
        reservationId: parsedId,
        tenantId,
        userId,
      });
    } catch (err) {
      throw toServiceError(err, "Failed to release medication reservation");
    }
  },

  async dispense(reservationId: string, quantity: number) {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      const parsedId = uuidSchema.parse(reservationId);
      const { tenantId, userId } = getTenantContext();
      return await pharmacyClinicalRepository.dispense({
        reservationId: parsedId,
        tenantId,
        quantity,
        userId,
      });
    } catch (err) {
      throw toServiceError(err, "Failed to dispense medication");
    }
  },

  async listActiveReservations(medicationId: string) {
    try {
      assertAnyPermission(["manage_pharmacy"]);
      await featureAccessService.assertFeatureAccess("pharmacy");
      const parsedId = uuidSchema.parse(medicationId);
      const { tenantId } = getTenantContext();
      return await pharmacyClinicalRepository.listActiveReservations(parsedId, tenantId);
    } catch (err) {
      throw toServiceError(err, "Failed to load medication reservations");
    }
  },
};
