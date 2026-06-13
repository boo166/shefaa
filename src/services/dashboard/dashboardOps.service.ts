import { scoreBillingReconciliationHealth } from "@/services/billing/billingReconciliation";
import { billingReconciliationService } from "@/services/billing/billingReconciliation";
import { billingService } from "@/services/billing/billing.service";
import { appointmentQueueService } from "@/services/appointments/appointmentQueue.service";
import { labService } from "@/services/laboratory/lab.service";
import { pharmacyService } from "@/services/pharmacy/pharmacy.service";
import { notificationRepository } from "@/services/notifications/notification.repository";
import { notificationReconciliationRepository } from "@/services/notifications/notificationReconciliation.repository";
import { appointmentReconciliationRepository } from "@/services/appointments/appointmentReconciliation.repository";
import { getTenantContext } from "@/services/supabase/tenant";
import { toServiceError } from "@/services/supabase/errors";
import { dashboardOpsRepository } from "./dashboardOps.repository";

export type ReconciliationStatusLevel = "clean" | "warning" | "critical";

export type OperationsCenterSnapshot = {
  clinic: {
    waitingNow: number;
    inService: number;
    completedToday: number;
    noShowRate: number;
    doctorsOnline: number;
  };
  financial: {
    revenueToday: number;
    outstandingBalance: number;
    refundsToday: number;
    writeOffsToday: number;
    reconciliationStatus: ReconciliationStatusLevel;
    openFindingCount: number;
  };
  clinical: {
    pendingLabs: number;
    criticalLabResults: number;
    activePrescriptions: number;
    lowStockAlerts: number;
  };
  system: {
    notificationsDelivered: number;
    deadLetters: number;
    failedEvents: number;
    queueDivergence: number;
    lastReconciliationAt: string | null;
  };
};

const EMPTY_SNAPSHOT: OperationsCenterSnapshot = {
  clinic: {
    waitingNow: 0,
    inService: 0,
    completedToday: 0,
    noShowRate: 0,
    doctorsOnline: 0,
  },
  financial: {
    revenueToday: 0,
    outstandingBalance: 0,
    refundsToday: 0,
    writeOffsToday: 0,
    reconciliationStatus: "clean",
    openFindingCount: 0,
  },
  clinical: {
    pendingLabs: 0,
    criticalLabResults: 0,
    activePrescriptions: 0,
    lowStockAlerts: 0,
  },
  system: {
    notificationsDelivered: 0,
    deadLetters: 0,
    failedEvents: 0,
    queueDivergence: 0,
    lastReconciliationAt: null,
  },
};

function reconciliationLevelFromHealth(
  health: ReturnType<typeof scoreBillingReconciliationHealth>,
  openFindingCount: number,
  criticalCount: number,
): ReconciliationStatusLevel {
  if (health === "CONTAINED" || criticalCount >= 2) return "critical";
  if (health === "DEGRADED" || criticalCount >= 1 || openFindingCount >= 3) return "warning";
  if (openFindingCount > 0) return "warning";
  return "clean";
}

async function tryLoad<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

export const dashboardOpsService = {
  async getOperationsCenterSnapshot(): Promise<OperationsCenterSnapshot> {
    try {
      const { tenantId } = getTenantContext();
      const snapshot = structuredClone(EMPTY_SNAPSHOT);

      const queueEntries = await tryLoad(
        () => appointmentQueueService.listToday(),
        [],
      );

      snapshot.clinic.waitingNow = queueEntries.filter((e) => e.status === "waiting").length;
      snapshot.clinic.inService = queueEntries.filter((e) => e.status === "in_service").length;
      snapshot.clinic.completedToday = queueEntries.filter((e) => e.status === "done").length;
      const noShows = queueEntries.filter((e) => e.status === "no_show").length;
      const queueTotal = queueEntries.length;
      snapshot.clinic.noShowRate = queueTotal > 0 ? (noShows / queueTotal) * 100 : 0;

      const inServiceDoctorNames = new Set(
        queueEntries
          .filter((e) => e.status === "in_service" || e.status === "called")
          .map((e) => e.appointments?.doctors?.full_name)
          .filter((name): name is string => Boolean(name)),
      );
      snapshot.clinic.doctorsOnline = inServiceDoctorNames.size;

      const [billingSummary, todayFinancial, reconSnapshot] = await Promise.all([
        tryLoad(() => billingService.getSummary(), null),
        tryLoad(() => dashboardOpsRepository.getTodayFinancialMetrics(tenantId), {
          revenue_today: 0,
          refunds_today: 0,
          write_offs_today: 0,
        }),
        tryLoad(() => billingReconciliationService.getOpsSnapshot(), {
          latestRun: null,
          openFindings: [],
        }),
      ]);

      snapshot.financial.revenueToday = todayFinancial.revenue_today;
      snapshot.financial.refundsToday = todayFinancial.refunds_today;
      snapshot.financial.writeOffsToday = todayFinancial.write_offs_today;
      snapshot.financial.outstandingBalance = billingSummary?.pending_amount ?? 0;
      snapshot.financial.openFindingCount = reconSnapshot.openFindings.length;
      const criticalCount = reconSnapshot.openFindings.filter((f) => f.severity === "critical").length;
      snapshot.financial.reconciliationStatus = reconciliationLevelFromHealth(
        scoreBillingReconciliationHealth(reconSnapshot),
        reconSnapshot.openFindings.length,
        criticalCount,
      );

      const [labCounts, pharmacySummary, activePrescriptions, criticalLabs] = await Promise.all([
        tryLoad(() => labService.countByStatus(), { pending: 0, processing: 0, completed: 0 }),
        tryLoad(() => pharmacyService.getSummary(), { total_count: 0, low_stock_count: 0, inventory_value: 0 }),
        tryLoad(() => dashboardOpsRepository.countActivePrescriptions(tenantId), 0),
        tryLoad(() => dashboardOpsRepository.countCriticalLabResults(tenantId), 0),
      ]);

      snapshot.clinical.pendingLabs = labCounts.pending + labCounts.processing;
      snapshot.clinical.criticalLabResults = criticalLabs;
      snapshot.clinical.activePrescriptions = activePrescriptions;
      snapshot.clinical.lowStockAlerts = pharmacySummary.low_stock_count ?? 0;

      const reconWindowEnd = new Date();
      const reconWindowStart = new Date(reconWindowEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [deliveryAudit, appointmentRecon, notificationRecon] = await Promise.all([
        tryLoad(() => notificationRepository.listRecentDeliveryAuditEvidence(tenantId, 50), []),
        tryLoad(() => appointmentReconciliationRepository.run({
          tenantId,
          windowStart: reconWindowStart.toISOString(),
          windowEnd: reconWindowEnd.toISOString(),
          dryRun: true,
        }), { finding_count: 0, critical_count: 0, warning_count: 0, run_id: null }),
        tryLoad(() => notificationReconciliationRepository.run({
          tenantId,
          windowStart: reconWindowStart.toISOString(),
          windowEnd: reconWindowEnd.toISOString(),
          dryRun: true,
        }), { finding_count: 0, critical_count: 0, warning_count: 0, run_id: null }),
      ]);

      snapshot.system.notificationsDelivered = deliveryAudit.length;
      snapshot.system.deadLetters = notificationRecon.critical_count;
      snapshot.system.failedEvents = notificationRecon.finding_count;
      snapshot.system.queueDivergence = appointmentRecon.finding_count ?? 0;
      snapshot.system.lastReconciliationAt = reconSnapshot.latestRun?.completed_at ?? null;

      return snapshot;
    } catch (err) {
      throw toServiceError(err, "Failed to load operations center snapshot");
    }
  },
};
