import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

function pharmacyCtx(tenantId: string, action: string): PlatformRepositoryContext {
  return {
    action,
    classification: "tenant-critical",
    tenantScoped: true,
    tenantId,
    subsystem: "pharmacy",
  };
}

export type MedicationReservation = {
  id: string;
  medication_id: string;
  quantity: number;
  status: "active" | "released" | "dispensed";
  reserved_at: string;
};

export const pharmacyClinicalRepository = {
  async reserve(input: {
    medicationId: string;
    tenantId: string;
    quantity: number;
    userId?: string | null;
  }) {
    const { data, error } = await platformRepository.rpc("command_medication_reserve", {
      p_medication_id: input.medicationId,
      p_tenant_id: input.tenantId,
      p_quantity: input.quantity,
      p_user_id: input.userId ?? null,
    }, pharmacyCtx(input.tenantId, "pharmacy.clinical.reserve"));
    if (error) throw new ServiceError(error.message ?? "Failed to reserve medication", { code: error.code, details: error });
    return (data as any[])?.[0] ?? null;
  },

  async release(input: {
    reservationId: string;
    tenantId: string;
    userId?: string | null;
  }) {
    const { data, error } = await platformRepository.rpc("command_medication_release", {
      p_reservation_id: input.reservationId,
      p_tenant_id: input.tenantId,
      p_user_id: input.userId ?? null,
    }, pharmacyCtx(input.tenantId, "pharmacy.clinical.release"));
    if (error) throw new ServiceError(error.message ?? "Failed to release medication reservation", { code: error.code, details: error });
    return (data as any[])?.[0] ?? null;
  },

  async dispense(input: {
    reservationId: string;
    tenantId: string;
    quantity: number;
    userId?: string | null;
  }) {
    const { data, error } = await platformRepository.rpc("command_medication_dispense", {
      p_reservation_id: input.reservationId,
      p_tenant_id: input.tenantId,
      p_quantity: input.quantity,
      p_user_id: input.userId ?? null,
    }, pharmacyCtx(input.tenantId, "pharmacy.clinical.dispense"));
    if (error) throw new ServiceError(error.message ?? "Failed to dispense medication", { code: error.code, details: error });
    return (data as any[])?.[0] ?? null;
  },

  async listActiveReservations(medicationId: string, tenantId: string): Promise<MedicationReservation[]> {
    const { data, error } = await platformRepository
      .from("medication_reservations", pharmacyCtx(tenantId, "pharmacy.clinical.listReservations"))
      .select("id, medication_id, quantity, status, reserved_at")
      .eq("tenant_id", tenantId)
      .eq("medication_id", medicationId)
      .eq("status", "active")
      .order("reserved_at", { ascending: false });
    if (error) throw new ServiceError(error.message ?? "Failed to load reservations", { code: error.code, details: error });
    return (data ?? []) as MedicationReservation[];
  },
};
