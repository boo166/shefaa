import { z } from "zod";
import {
  appointmentStatusRowSchema,
  appointmentTypeRowSchema,
  doctorPerformanceRowSchema,
  patientGrowthRowSchema,
  reportOverviewSchema,
  revenueByMonthRowSchema,
  revenueByServiceRowSchema,
} from "@/domain/reports/reports.schema";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { reportRepository } from "./report.repository";

const statusCountsSchema = z.object({
  scheduled: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});

const monthLabel = (dateStr: string, withYear: boolean) =>
  new Date(dateStr).toLocaleString("en", withYear ? { month: "short", year: "2-digit" } : { month: "short" });

export const reportService = {
  async getOverview() {
    try {
      const { tenantId } = getTenantContext();
      const result = await reportRepository.getOverview(tenantId);
      return reportOverviewSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load reports overview");
    }
  },
  async getRevenueByMonth(months = 6) {
    try {
      const { tenantId } = getTenantContext();
      const result = await reportRepository.getRevenueByMonth(tenantId, months);
      const rows = z.array(revenueByMonthRowSchema).parse(result);
      return rows.map((row) => ({
        month: monthLabel(row.month_start, true),
        revenue: row.revenue,
        expenses: row.expenses,
      }));
    } catch (err) {
      throw toServiceError(err, "Failed to load revenue report");
    }
  },
  async getPatientGrowth(months = 6) {
    try {
      const { tenantId } = getTenantContext();
      const result = await reportRepository.getPatientGrowth(tenantId, months);
      const rows = z.array(patientGrowthRowSchema).parse(result);
      return rows.map((row) => ({
        month: monthLabel(row.month_start, false),
        patients: row.total_patients,
      }));
    } catch (err) {
      throw toServiceError(err, "Failed to load patient growth report");
    }
  },
  async getAppointmentTypes() {
    try {
      const { tenantId } = getTenantContext();
      const result = await reportRepository.getAppointmentTypes(tenantId);
      const rows = z.array(appointmentTypeRowSchema).parse(result);
      return rows.map((row) => ({
        name: row.type.replace("_", " "),
        value: row.count,
      }));
    } catch (err) {
      throw toServiceError(err, "Failed to load appointment types report");
    }
  },
  async getAppointmentStatusCounts() {
    try {
      const { tenantId } = getTenantContext();
      const result = await reportRepository.getAppointmentStatuses(tenantId);
      const rows = z.array(appointmentStatusRowSchema).parse(result);
      const counts = rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {});
      return statusCountsSchema.parse({
        scheduled: counts.scheduled ?? 0,
        in_progress: counts.in_progress ?? 0,
        completed: counts.completed ?? 0,
        cancelled: counts.cancelled ?? 0,
      });
    } catch (err) {
      throw toServiceError(err, "Failed to load appointment status report");
    }
  },
  async getRevenueByService(limit = 6) {
    try {
      const { tenantId } = getTenantContext();
      const result = await reportRepository.getRevenueByService(tenantId, limit);
      const rows = z.array(revenueByServiceRowSchema).parse(result);
      return rows.map((row) => ({
        name: row.service,
        value: row.revenue,
      }));
    } catch (err) {
      throw toServiceError(err, "Failed to load revenue by service report");
    }
  },
  async getDoctorPerformance() {
    try {
      const { tenantId } = getTenantContext();
      const result = await reportRepository.getDoctorPerformance(tenantId);
      const rows = z.array(doctorPerformanceRowSchema).parse(result);
      return rows
        .map((row) => {
          const completedRateValue = row.appointments ? Math.round((row.completed / row.appointments) * 100) : 0;
          return {
            name: row.doctor_name,
            appointments: row.appointments,
            rating: row.rating,
            completedRate: `${completedRateValue}%`,
            trend: row.completed > row.appointments / 2,
          };
        })
        .sort((a, b) => b.appointments - a.appointments);
    } catch (err) {
      throw toServiceError(err, "Failed to load doctor performance report");
    }
  },
};
