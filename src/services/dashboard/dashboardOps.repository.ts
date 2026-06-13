import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

function dashboardCtx(tenantId: string, action: string): PlatformRepositoryContext {
  return {
    action,
    classification: "readonly",
    tenantScoped: true,
    tenantId,
    subsystem: "reports",
  };
}

export type TodayFinancialMetrics = {
  revenue_today: number;
  refunds_today: number;
  write_offs_today: number;
};

export const dashboardOpsRepository = {
  async getTodayFinancialMetrics(tenantId: string): Promise<TodayFinancialMetrics> {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = tomorrow.toISOString().slice(0, 10);

    const [paymentsResult, refundsResult] = await Promise.all([
      platformRepository
        .from("invoice_payments", dashboardCtx(tenantId, "dashboard.paymentsToday"))
        .select("amount")
        .eq("tenant_id", tenantId)
        .gte("paid_at", `${today}T00:00:00`)
        .lt("paid_at", `${tomorrowKey}T00:00:00`),
      platformRepository
        .from("invoice_refunds", dashboardCtx(tenantId, "dashboard.refundsToday"))
        .select("amount")
        .eq("tenant_id", tenantId)
        .gte("refunded_at", `${today}T00:00:00`)
        .lt("refunded_at", `${tomorrowKey}T00:00:00`),
    ]);

    if (paymentsResult.error) {
      throw new ServiceError(paymentsResult.error.message ?? "Failed to load today's payments", {
        code: paymentsResult.error.code,
        details: paymentsResult.error,
      });
    }
    if (refundsResult.error) {
      throw new ServiceError(refundsResult.error.message ?? "Failed to load today's refunds", {
        code: refundsResult.error.code,
        details: refundsResult.error,
      });
    }

    const revenue_today = (paymentsResult.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const refunds_today = (refundsResult.data ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const write_offs_today = 0;

    return { revenue_today, refunds_today, write_offs_today };
  },

  async countActivePrescriptions(tenantId: string): Promise<number> {
    const { count, error } = await platformRepository
      .from("prescriptions", dashboardCtx(tenantId, "dashboard.activePrescriptions"))
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to count active prescriptions", {
        code: error.code,
        details: error,
      });
    }
    return count ?? 0;
  },

  async countCriticalLabResults(tenantId: string): Promise<number> {
    const { count, error } = await platformRepository
      .from("lab_orders", dashboardCtx(tenantId, "dashboard.criticalLabs"))
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "completed")
      .in("abnormal_flag", ["critical", "high", "low"])
      .is("deleted_at", null);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to count critical lab results", {
        code: error.code,
        details: error,
      });
    }
    return count ?? 0;
  },

  async countDoctorsInService(tenantId: string, doctorIds: string[]): Promise<number> {
    if (doctorIds.length === 0) return 0;
    const unique = [...new Set(doctorIds)];
    const { count, error } = await platformRepository
      .from("doctors", dashboardCtx(tenantId, "dashboard.doctorsOnline"))
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("id", unique)
      .is("deleted_at", null);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to count doctors in service", {
        code: error.code,
        details: error,
      });
    }
    return count ?? 0;
  },
};
