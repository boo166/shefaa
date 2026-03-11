import type { z } from "zod";
import {
  reportOverviewSchema,
  revenueByMonthRowSchema,
  patientGrowthRowSchema,
  appointmentTypeRowSchema,
  appointmentStatusRowSchema,
  revenueByServiceRowSchema,
  doctorPerformanceRowSchema,
} from "./reports.schema";

export type ReportOverview = z.infer<typeof reportOverviewSchema>;
export type RevenueByMonthRow = z.infer<typeof revenueByMonthRowSchema>;
export type PatientGrowthRow = z.infer<typeof patientGrowthRowSchema>;
export type AppointmentTypeRow = z.infer<typeof appointmentTypeRowSchema>;
export type AppointmentStatusRow = z.infer<typeof appointmentStatusRowSchema>;
export type RevenueByServiceRow = z.infer<typeof revenueByServiceRowSchema>;
export type DoctorPerformanceRow = z.infer<typeof doctorPerformanceRowSchema>;
