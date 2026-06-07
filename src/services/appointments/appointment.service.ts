import { z } from "zod";
import {
  appointmentCreateSchema,
  appointmentListParamsSchema,
  appointmentSchema,
  appointmentStatusEnum,
  appointmentUpdateSchema,
  appointmentWithDoctorSchema,
  appointmentWithPatientDoctorSchema,
} from "@/domain/appointment/appointment.schema";
import { dateTimeStringSchema } from "@/domain/shared/date.schema";
import { uuidSchema } from "@/domain/shared/identifiers.schema";
import { statePolicies } from "@/domain/workflows/statePolicies";
import type { AppointmentCreateInput, AppointmentListParams, AppointmentUpdateInput } from "@/domain/appointment/appointment.types";
import type { LimitOffsetParams } from "@/domain/shared/pagination.types";
import { limitOffsetSchema } from "@/domain/shared/pagination.schema";
import { emitDomainEvent } from "@/core/events";
import { BusinessRuleError, ConflictError, NotFoundError, ServiceError, toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { assertAnyPermission } from "@/services/supabase/permissions";
import { withAuthStaleGuard } from "@/services/auth/authContextSnapshot";
import { auditLogService } from "@/services/settings/audit.service";
import { doctorRepository } from "@/services/doctors/doctor.repository";
import { doctorScheduleRepository } from "@/services/doctors/doctorSchedule.repository";
import { appointmentLifecycleWorkflow } from "./appointmentLifecycle.workflow";
import { appointmentRepository } from "./appointment.repository";

const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;
async function ensureNoConflict(
  doctorId: string,
  appointmentDate: string,
  tenantId: string,
  excludeId?: string,
) {
  const hasConflict = await appointmentRepository.hasConflict(doctorId, appointmentDate, tenantId, excludeId);
  if (hasConflict) {
    throw new Error("Appointment conflict detected");
  }
}

function getLocalDayMinutes(appointmentDate: string) {
  const parsed = new Date(appointmentDate);
  return {
    dayOfWeek: parsed.getDay(),
    minutes: (parsed.getHours() * 60) + parsed.getMinutes(),
  };
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number.parseInt(part, 10));
  return (hour * 60) + minute;
}

async function ensureDoctorAvailability(
  doctorId: string,
  appointmentDate: string,
  durationMinutes: number,
  tenantId: string,
) {
  const doctor = await doctorRepository.getById(doctorId, tenantId);
  if (doctor.status === "on_leave") {
    throw new BusinessRuleError("Doctor is currently unavailable for booking", {
      code: "DOCTOR_ON_LEAVE",
      details: { doctorId },
    });
  }

  const schedules = await doctorScheduleRepository.listByDoctor(doctorId, tenantId);
  if (schedules.length === 0) return;

  const { dayOfWeek, minutes } = getLocalDayMinutes(appointmentDate);
  const appointmentEndMinutes = minutes + durationMinutes;
  const activeSchedules = schedules.filter((schedule) => schedule.is_active && schedule.day_of_week === dayOfWeek);

  if (activeSchedules.length === 0) {
    throw new BusinessRuleError("Doctor is not scheduled to work on the selected day", {
      code: "DOCTOR_OFF_SCHEDULE",
      details: { doctorId, appointmentDate },
    });
  }

  const fitsWorkingHours = activeSchedules.some((schedule) => {
    const scheduleStart = timeToMinutes(schedule.start_time);
    const scheduleEnd = timeToMinutes(schedule.end_time);
    return minutes >= scheduleStart && appointmentEndMinutes <= scheduleEnd;
  });

  if (!fitsWorkingHours) {
    throw new BusinessRuleError("Appointment falls outside the doctor's working hours", {
      code: "DOCTOR_OUTSIDE_WORKING_HOURS",
      details: { doctorId, appointmentDate, durationMinutes },
    });
  }
}

function assertStatusTransition(
  currentStatus: z.infer<typeof appointmentStatusEnum>,
  nextStatus: z.infer<typeof appointmentStatusEnum>,
) {
  if (currentStatus === nextStatus) return;
  if (!statePolicies.appointments.canTransition(currentStatus, nextStatus)) {
    throw new BusinessRuleError(`Cannot move appointment from ${currentStatus} to ${nextStatus}`, {
      code: "APPOINTMENT_STATUS_TRANSITION_INVALID",
      details: { currentStatus, nextStatus },
    });
  }
}

function isExclusionConflict(err: unknown) {
  if (!(err instanceof ServiceError)) return false;
  if (err.code === "23P01") return true;
  const message = `${err.message ?? ""}`;
  const detailsMessage =
    typeof (err.details as { message?: string } | undefined)?.message === "string"
      ? (err.details as { message: string }).message
      : "";
  return message.includes("appointments_no_overlap") || detailsMessage.includes("appointments_no_overlap");
}

export const appointmentService = {
  async listPaged(params: AppointmentListParams) {
    try {
      assertAnyPermission(["view_appointments", "manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const parsed = appointmentListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await appointmentRepository.listPaged(parsed, tenantId);
        const data = z.array(appointmentSchema).parse(result.data);
        const count = z.number().int().nonnegative().parse(result.count);
        return { data, count };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load appointments");
    }
  },
  async listPagedWithRelations(params: AppointmentListParams) {
    try {
      assertAnyPermission(["view_appointments", "manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const parsed = appointmentListParamsSchema.parse(params);
        const { tenantId } = getTenantContext();
        const result = await appointmentRepository.listPagedWithRelations(parsed, tenantId);
        const data = z.array(appointmentWithPatientDoctorSchema).parse(result.data);
        const count = z.number().int().nonnegative().parse(result.count);
        return { data, count };
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load appointments");
    }
  },
  async listByDateRange(start: string, end: string, params?: LimitOffsetParams) {
    try {
      assertAnyPermission(["view_appointments", "manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const parsedStart = dateTimeStringSchema.parse(start);
        const parsedEnd = dateTimeStringSchema.parse(end);
        const paging = limitOffsetSchema.parse(params ?? {});
        const { tenantId } = getTenantContext();
        const result = await appointmentRepository.listByDateRange(parsedStart, parsedEnd, tenantId, paging);
        return z.array(appointmentWithPatientDoctorSchema).parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load appointments");
    }
  },
  async listByPatient(patientId: string, params?: LimitOffsetParams) {
    try {
      assertAnyPermission(["view_appointments", "manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(patientId);
        const paging = limitOffsetSchema.parse(params ?? {});
        const { tenantId } = getTenantContext();
        const result = await appointmentRepository.listByPatient(parsedId, tenantId, paging);
        return z.array(appointmentWithDoctorSchema).parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load patient appointments");
    }
  },
  async countByStatus() {
    try {
      assertAnyPermission(["view_appointments", "manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const { tenantId } = getTenantContext();
        const result = await appointmentRepository.countByStatus(tenantId);
        return z.record(z.number().int().nonnegative()).parse(result);
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load appointment counts");
    }
  },
  async create(input: AppointmentCreateInput) {
    try {
      assertAnyPermission(["manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const parsed = appointmentCreateSchema.parse(input);
        const { tenantId, userId } = getTenantContext();
        const durationMinutes = parsed.duration_minutes ?? DEFAULT_APPOINTMENT_DURATION_MINUTES;
        await ensureDoctorAvailability(parsed.doctor_id, parsed.appointment_date, durationMinutes, tenantId);
        await ensureNoConflict(parsed.doctor_id, parsed.appointment_date, tenantId);
        const result = await appointmentRepository.create(parsed, tenantId);
        const appointment = appointmentSchema.parse(result);
        await auditLogService.logEvent({
          tenant_id: tenantId,
          user_id: userId,
          action: "appointment_created",
          action_type: "appointment_create",
          entity_type: "appointment",
          entity_id: appointment.id,
          details: {
            patient_id: appointment.patient_id,
            doctor_id: appointment.doctor_id,
            appointment_date: appointment.appointment_date,
            status: appointment.status,
          },
        });
        await emitDomainEvent(
          "AppointmentCreated",
          {
            appointmentId: appointment.id,
            patientId: appointment.patient_id,
            doctorId: appointment.doctor_id,
            appointmentDate: appointment.appointment_date,
          },
          { tenantId, userId },
        );
        return appointment;
      });
    } catch (err) {
      if (isExclusionConflict(err)) {
        throw new ServiceError("Appointment overlaps with an existing booking", {
          code: "APPOINTMENT_OVERLAP",
          details: err,
        });
      }
      throw toServiceError(err, "Failed to create appointment");
    }
  },
  async update(id: string, input: AppointmentUpdateInput) {
    try {
      assertAnyPermission(["manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const parsed = appointmentUpdateSchema.parse(input);
        const { expected_updated_at, ...updates } = parsed;
        const { tenantId, userId } = getTenantContext();
        let existing: z.infer<typeof appointmentSchema> | null = null;
        const loadExisting = async () => {
          if (!existing) {
            existing = appointmentSchema.parse(await appointmentRepository.getById(parsedId, tenantId));
          }
          return existing;
        };

        if (updates.status !== undefined) {
          const current = await loadExisting();
          assertStatusTransition(current.status, updates.status);
        }

        if (updates.doctor_id !== undefined || updates.appointment_date !== undefined || updates.duration_minutes !== undefined) {
          const current = await loadExisting();
          const doctorId = updates.doctor_id ?? current.doctor_id;
          const appointmentDate = updates.appointment_date ?? current.appointment_date;
          const durationMinutes = updates.duration_minutes ?? current.duration_minutes;
          await ensureDoctorAvailability(doctorId, appointmentDate, durationMinutes, tenantId);
          await ensureNoConflict(doctorId, appointmentDate, tenantId, parsedId);
        }

        if (updates.status === "cancelled" && Object.keys(updates).length === 1) {
          const result = await appointmentLifecycleWorkflow.cancelAppointment(parsedId, tenantId, userId, expected_updated_at);
          if (result.result_code === "CONFLICT") {
            throw new ConflictError(result.message ?? "Appointment was modified by another user", {
              code: "CONCURRENT_UPDATE",
            });
          }
          if (!result.appointment) {
            throw new NotFoundError("Appointment not found");
          }
          return appointmentSchema.parse(result.appointment);
        }

        const result = await appointmentRepository.update(parsedId, updates, tenantId, expected_updated_at);
        if (!result) {
          if (expected_updated_at) {
            throw new ConflictError("Appointment was modified by another user", {
              code: "CONCURRENT_UPDATE",
            });
          }
          throw new NotFoundError("Appointment not found");
        }
        const appointment = appointmentSchema.parse(result);
        await auditLogService.logEvent({
          tenant_id: tenantId,
          user_id: userId,
          action: "appointment_updated",
          action_type: "appointment_update",
          entity_type: "appointment",
          entity_id: appointment.id,
          details: updates as Record<string, unknown>,
        });
        return appointment;
      });
    } catch (err) {
      if (isExclusionConflict(err)) {
        throw new ServiceError("Appointment overlaps with an existing booking", {
          code: "APPOINTMENT_OVERLAP",
          details: err,
        });
      }
      throw toServiceError(err, "Failed to update appointment");
    }
  },
  async archive(id: string) {
    try {
      assertAnyPermission(["manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId, userId } = getTenantContext();
        const result = await appointmentRepository.archive(parsedId, tenantId, userId);
        const appointment = appointmentSchema.parse(result);
        await auditLogService.logEvent({
          tenant_id: tenantId,
          user_id: userId,
          action: "appointment_archived",
          action_type: "appointment_archive",
          entity_type: "appointment",
          entity_id: appointment.id,
        });
        return appointment;
      });
    } catch (err) {
      throw toServiceError(err, "Failed to archive appointment");
    }
  },
  async restore(id: string) {
    try {
      assertAnyPermission(["manage_appointments"]);
      return await withAuthStaleGuard(async () => {
        const parsedId = uuidSchema.parse(id);
        const { tenantId, userId } = getTenantContext();
        const result = await appointmentRepository.restore(parsedId, tenantId);
        const appointment = appointmentSchema.parse(result);
        await auditLogService.logEvent({
          tenant_id: tenantId,
          user_id: userId,
          action: "appointment_restored",
          action_type: "appointment_restore",
          entity_type: "appointment",
          entity_id: appointment.id,
        });
        return appointment;
      });
    } catch (err) {
      throw toServiceError(err, "Failed to restore appointment");
    }
  },
};
