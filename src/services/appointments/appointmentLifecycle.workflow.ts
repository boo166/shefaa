import type { PlatformTraceIds } from "@/platform/observability/traceContext";
import type { AppointmentQueue, AppointmentQueueStatus } from "@/domain/appointmentQueue/appointmentQueue.types";
import { ConflictError, NotFoundError } from "@/services/supabase/errors";
import { appointmentQueueRepository } from "./appointmentQueue.repository";

type LifecycleOperation = "check_in" | "call" | "wait" | "start" | "complete" | "no_show" | "cancel";

const STATUS_TO_OPERATION: Record<AppointmentQueueStatus, LifecycleOperation> = {
  waiting: "wait",
  called: "call",
  in_service: "start",
  done: "complete",
  no_show: "no_show",
};

function buildLifecycleTrace(tenantId: string, userId?: string | null, trace?: Partial<PlatformTraceIds>) {
  return {
    ...(trace ?? {}),
    tenantId,
    actorId: userId ?? trace?.actorId ?? null,
  };
}

function requestHash(parts: Array<string | null | undefined>) {
  return parts.map((part) => part ?? "").join("|");
}

async function runCommand(input: {
  operation: LifecycleOperation;
  appointmentId?: string | null;
  queueId?: string | null;
  tenantId: string;
  userId?: string | null;
  expectedUpdatedAt?: string | null;
  trace?: Partial<PlatformTraceIds>;
}) {
  const trace = buildLifecycleTrace(input.tenantId, input.userId, input.trace);
  const result = await appointmentQueueRepository.commandLifecycle({
    ...input,
    trace,
    requestHash: requestHash([
      input.operation,
      input.tenantId,
      input.appointmentId,
      input.queueId,
      input.expectedUpdatedAt,
    ]),
  });

  if (result.result_code === "CONFLICT") {
    throw new ConflictError(result.message ?? "Appointment lifecycle state changed", {
      code: "APPOINTMENT_LIFECYCLE_CONFLICT",
    });
  }
  if (!result.queue_entry && input.operation !== "cancel") {
    throw new NotFoundError("Appointment lifecycle command returned no queue entry", {
      code: "APPOINTMENT_LIFECYCLE_QUEUE_NOT_FOUND",
    });
  }
  return result;
}

export const appointmentLifecycleWorkflow = {
  async checkIn(appointmentId: string, tenantId: string, userId?: string | null, trace?: Partial<PlatformTraceIds>) {
    const result = await runCommand({ operation: "check_in", appointmentId, tenantId, userId, trace });
    return result.queue_entry as AppointmentQueue;
  },

  async updateQueueStatus(
    queueId: string,
    status: AppointmentQueueStatus,
    tenantId: string,
    userId?: string | null,
    expectedUpdatedAt?: string | null,
    trace?: Partial<PlatformTraceIds>,
  ) {
    const operation = STATUS_TO_OPERATION[status];
    const result = await runCommand({ operation, queueId, tenantId, userId, expectedUpdatedAt, trace });
    return result.queue_entry as AppointmentQueue;
  },

  async cancelAppointment(appointmentId: string, tenantId: string, userId?: string | null, expectedUpdatedAt?: string | null, trace?: Partial<PlatformTraceIds>) {
    return runCommand({ operation: "cancel", appointmentId, tenantId, userId, expectedUpdatedAt, trace });
  },
};
