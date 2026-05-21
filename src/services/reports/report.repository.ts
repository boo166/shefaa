import type {
  AppointmentStatusRow,
  AppointmentTypeRow,
  DoctorPerformanceRow,
  PatientGrowthRow,
  ReportOverview,
  ReportRefreshStatus,
  RevenueByMonthRow,
  RevenueByServiceRow,
} from "@/domain/reports/reports.types";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

function reportCtx(
  action: string,
  classification: PlatformRepositoryContext["classification"] = "readonly",
  tenantId?: string,
): PlatformRepositoryContext {
  return {
    action,
    classification,
    tenantScoped: Boolean(tenantId),
    tenantId: tenantId ?? null,
  };
}

export interface ReportRepository {
  assertAccess(tenantId: string): Promise<void>;
  getRefreshStatus(tenantId: string): Promise<ReportRefreshStatus | null>;
  getOverview(tenantId: string): Promise<ReportOverview>;
  getRevenueByMonth(tenantId: string, months?: number): Promise<RevenueByMonthRow[]>;
  getPatientGrowth(tenantId: string, months?: number): Promise<PatientGrowthRow[]>;
  getAppointmentTypes(tenantId: string): Promise<AppointmentTypeRow[]>;
  getAppointmentStatuses(tenantId: string): Promise<AppointmentStatusRow[]>;
  getRevenueByService(tenantId: string, limit?: number): Promise<RevenueByServiceRow[]>;
  getDoctorPerformance(tenantId: string): Promise<DoctorPerformanceRow[]>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

export const reportRepository: ReportRepository = {
  async assertAccess(_tenantId) {
    const { error } = await platformRepository.rpc(
      "assert_can_view_reports",
      {},
      reportCtx("reports.assertAccess"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Not authorized to view reports", {
        code: error.code,
        details: error,
      });
    }
  },
  async getRefreshStatus(_tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_report_refresh_status",
      {},
      reportCtx("reports.getRefreshStatus"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load report refresh status", {
        code: error.code,
        details: error,
      });
    }
    return ((data as any)?.[0] ?? null) as ReportRefreshStatus | null;
  },
  async getOverview(tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_report_overview",
      { _tenant_id: tenantId },
      reportCtx("reports.getOverview", "tenant-critical", tenantId),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load report overview", {
        code: error.code,
        details: error,
      });
    }
    return ((data as any)?.[0] ?? { total_revenue: 0, total_patients: 0, total_appointments: 0, avg_doctor_rating: 0 }) as ReportOverview;
  },
  async getRevenueByMonth(tenantId, months = 6) {
    const { data, error } = await platformRepository.rpc(
      "get_report_revenue_by_month",
      {
        _months: months,
        _tenant_id: tenantId,
      } as any,
      reportCtx("reports.getRevenueByMonth", "tenant-critical", tenantId),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load revenue report", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as RevenueByMonthRow[];
  },
  async getPatientGrowth(tenantId, months = 6) {
    const { data, error } = await platformRepository.rpc(
      "get_report_patient_growth",
      {
        _months: months,
        _tenant_id: tenantId,
      } as any,
      reportCtx("reports.getPatientGrowth", "tenant-critical", tenantId),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient growth report", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as PatientGrowthRow[];
  },
  async getAppointmentTypes(_tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_report_appointment_types",
      {},
      reportCtx("reports.getAppointmentTypes"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load appointment types report", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as AppointmentTypeRow[];
  },
  async getAppointmentStatuses(_tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_report_appointment_statuses",
      {},
      reportCtx("reports.getAppointmentStatuses"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load appointment status report", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as AppointmentStatusRow[];
  },
  async getRevenueByService(_tenantId, limit = 6) {
    const { data, error } = await platformRepository.rpc(
      "get_report_revenue_by_service",
      { _limit: limit },
      reportCtx("reports.getRevenueByService"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load revenue by service report", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as RevenueByServiceRow[];
  },
  async getDoctorPerformance(_tenantId) {
    const { data, error } = await platformRepository.rpc(
      "get_report_doctor_performance",
      {},
      reportCtx("reports.getDoctorPerformance"),
    );
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load doctor performance report", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as DoctorPerformanceRow[];
  },
  describe() {
    return {
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: false,
      recoveryAware: false,
      evidenceAware: false,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: ["reports.analytics.view"],
    };
  },
};
