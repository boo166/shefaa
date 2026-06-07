import { z } from "zod";
import { appointmentQueueSchema, appointmentQueueWithRelationsSchema } from "@/domain/appointmentQueue/appointmentQueue.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import type { AppointmentQueueStatus } from "@/domain/appointmentQueue/appointmentQueue.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { assertAnyPermission } from "@/services/supabase/permissions";
import { appointmentLifecycleWorkflow } from "./appointmentLifecycle.workflow";
import { appointmentQueueRepository } from "./appointmentQueue.repository";

function getTodayBounds() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export const appointmentQueueService = {
  async listToday() {
    try {
      assertAnyPermission(["view_appointments", "manage_appointments"]);
      const { tenantId } = getTenantContext();
      const { start, end } = getTodayBounds();
      const result = await appointmentQueueRepository.listByCheckInRange(start, end, tenantId);
      return z.array(appointmentQueueWithRelationsSchema).parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load waiting room queue");
    }
  },
  async checkIn(appointmentId: string) {
    try {
      assertAnyPermission(["manage_appointments"]);
      const parsedId = uuidSchema.parse(appointmentId);
      const { tenantId, userId } = getTenantContext();
      const entry = appointmentQueueSchema.parse(await appointmentLifecycleWorkflow.checkIn(parsedId, tenantId, userId));
      return entry;
    } catch (err) {
      throw toServiceError(err, "Failed to check in appointment");
    }
  },
  async updateStatus(queueId: string, status: AppointmentQueueStatus) {
    try {
      assertAnyPermission(["manage_appointments"]);
      const parsedId = uuidSchema.parse(queueId);
      const parsedStatus = z.enum(["waiting", "called", "in_service", "done", "no_show"]).parse(status);
      const { tenantId, userId } = getTenantContext();
      const updated = appointmentQueueSchema.parse(await appointmentLifecycleWorkflow.updateQueueStatus(parsedId, parsedStatus, tenantId, userId));
      return updated;
    } catch (err) {
      throw toServiceError(err, "Failed to update waiting room status");
    }
  },
};
