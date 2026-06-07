import type { AppointmentQueue, AppointmentQueueWithRelations, AppointmentQueueStatus } from "@/domain/appointmentQueue/appointmentQueue.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { commandTraceParams } from "@/services/operational/commandTrace";
import { ServiceError } from "@/services/supabase/errors";
import { assertOk } from "@/services/supabase/query";

const APPOINTMENT_QUEUE_COLUMNS =
  "id, appointment_id, tenant_id, check_in_at, position, status, called_at, completed_at, created_at, updated_at";
const APPOINTMENT_QUEUE_WITH_RELATIONS_COLUMNS =
  `${APPOINTMENT_QUEUE_COLUMNS}, appointments!inner(id, appointment_date, duration_minutes, type, status, patients(full_name), doctors(full_name))`;

const APPT_QUEUE_READ_CAPS = [Capabilities.appointments.view, Capabilities.appointments.manage] as const;
const APPT_QUEUE_WRITE_CAPS = [Capabilities.appointments.manage] as const;

function queueCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
  requiredCapabilities?: string[],
  trace?: PlatformRepositoryContext["trace"],
): PlatformRepositoryContext {
  return { action, classification, tenantScoped: true, tenantId, requiredCapabilities, trace };
}

export type AppointmentLifecycleCommandResult = {
  result_code: string;
  retryable: boolean;
  idempotency_replay: boolean;
  message: string | null;
  appointment: Record<string, unknown> | null;
  queue_entry: AppointmentQueue | null;
};

export interface AppointmentQueueRepository {
  listByCheckInRange(start: string, end: string, tenantId: string): Promise<AppointmentQueueWithRelations[]>;
  getById(id: string, tenantId: string): Promise<AppointmentQueue | null>;
  getByAppointmentId(appointmentId: string, tenantId: string): Promise<AppointmentQueue | null>;
  commandLifecycle(input: {
    operation: "check_in" | "call" | "wait" | "start" | "complete" | "no_show" | "cancel";
    appointmentId?: string | null;
    queueId?: string | null;
    tenantId: string;
    userId?: string | null;
    expectedUpdatedAt?: string | null;
    idempotencyKey?: string | null;
    requestHash?: string | null;
    trace?: PlatformRepositoryContext["trace"];
  }): Promise<AppointmentLifecycleCommandResult>;
  create(
    input: { appointment_id: string; status?: AppointmentQueueStatus; position?: number | null },
    tenantId: string,
  ): Promise<AppointmentQueue>;
  update(
    id: string,
    input: {
      status?: AppointmentQueueStatus;
      position?: number | null;
      called_at?: string | null;
      completed_at?: string | null;
    },
    tenantId: string,
  ): Promise<AppointmentQueue>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    traceAware: boolean;
    runtimeAware: boolean;
    capabilityAware: boolean;
    reconciliationAware: boolean;
    recoveryAware: boolean;
    evidenceAware: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

export const appointmentQueueRepository: AppointmentQueueRepository = {
  async listByCheckInRange(start, end, tenantId) {
    const { data, error } = await platformRepository
      .from("appointment_queue", queueCtx(tenantId, "appointments.queue.listByCheckInRange", "readonly", [...APPT_QUEUE_READ_CAPS]))
      .select(APPOINTMENT_QUEUE_WITH_RELATIONS_COLUMNS)
      .eq("tenant_id", tenantId)
      .gte("check_in_at", start)
      .lte("check_in_at", end)
      .order("check_in_at", { ascending: true });

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load waiting room queue", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AppointmentQueueWithRelations[];
  },
  async getById(id, tenantId) {
    const { data, error } = await platformRepository
      .from("appointment_queue", queueCtx(tenantId, "appointments.queue.getById", "readonly", [...APPT_QUEUE_READ_CAPS]))
      .select(APPOINTMENT_QUEUE_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load queue entry", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? null) as AppointmentQueue | null;
  },
  async getByAppointmentId(appointmentId, tenantId) {
    const { data, error } = await platformRepository
      .from("appointment_queue", queueCtx(tenantId, "appointments.queue.getByAppointmentId", "readonly", [...APPT_QUEUE_READ_CAPS]))
      .select(APPOINTMENT_QUEUE_COLUMNS)
      .eq("appointment_id", appointmentId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load queue entry", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? null) as AppointmentQueue | null;
  },
  async commandLifecycle(input) {
    const { data, error } = await platformRepository.rpc("command_appointment_lifecycle", {
      p_operation: input.operation,
      p_appointment_id: input.appointmentId ?? null,
      p_queue_id: input.queueId ?? null,
      p_tenant_id: input.tenantId,
      p_expected_updated_at: input.expectedUpdatedAt ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
      p_request_hash: input.requestHash ?? null,
      p_user_id: input.userId ?? null,
      ...commandTraceParams(input.trace),
    }, queueCtx(input.tenantId, `appointments.lifecycle.${input.operation}`, "tenant-critical", [...APPT_QUEUE_WRITE_CAPS], input.trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to run appointment lifecycle command", {
        code: error.code,
        details: error,
      });
    }
    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Appointment lifecycle command returned no result", { code: "APPOINTMENT_LIFECYCLE_EMPTY_RESULT" });
    }
    return {
      result_code: row.result_code,
      retryable: Boolean(row.retryable),
      idempotency_replay: Boolean(row.idempotency_replay),
      message: row.message ?? null,
      appointment: row.appointment ?? null,
      queue_entry: row.queue_entry ?? null,
    };
  },
  async create(input, tenantId) {
    const payload: Record<string, unknown> = {
      appointment_id: input.appointment_id,
      tenant_id: tenantId,
    };

    if (input.status !== undefined) payload.status = input.status;
    if (input.position !== undefined) payload.position = input.position;

    const result = await platformRepository
      .from("appointment_queue", queueCtx(tenantId, "appointments.queue.create", "tenant-critical", [...APPT_QUEUE_WRITE_CAPS]))
      .insert(payload as any)
      .select(APPOINTMENT_QUEUE_COLUMNS)
      .single();

    return assertOk(result) as AppointmentQueue;
  },
  async update(id, input, tenantId) {
    const payload: Record<string, unknown> = {};

    if (input.status !== undefined) payload.status = input.status;
    if (input.position !== undefined) payload.position = input.position;
    if (input.called_at !== undefined) payload.called_at = input.called_at;
    if (input.completed_at !== undefined) payload.completed_at = input.completed_at;

    const result = await platformRepository
      .from("appointment_queue", queueCtx(tenantId, "appointments.queue.update", "tenant-critical", [...APPT_QUEUE_WRITE_CAPS]))
      .update(payload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(APPOINTMENT_QUEUE_COLUMNS)
      .single();

    return assertOk(result) as AppointmentQueue;
  },
  describe() {
    return {
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: false,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [Capabilities.appointments.view, Capabilities.appointments.manage],
    };
  },
};
