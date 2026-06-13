import { billingReconciliationService } from "@/services/billing/billingReconciliation";
import type { BillingReconciliationFinding } from "@/domain/billing/billing.types";
import { patientReconciliationRepository, type PatientReconciliationFinding } from "@/services/patients/patientReconciliation.repository";
import { notificationReconciliationRepository } from "@/services/notifications/notificationReconciliation.repository";
import { appointmentReconciliationRepository, type AppointmentReconciliationFinding } from "@/services/appointments/appointmentReconciliation.repository";
import { notificationRepository, type NotificationDeliveryAuditRow } from "@/services/notifications/notification.repository";
import { getTenantContext } from "@/services/supabase/tenant";
import { toServiceError } from "@/services/supabase/errors";

export type ClinicOpsFinding = {
  id: string;
  domain: "billing" | "patients" | "notifications" | "appointments";
  findingCode: string;
  severity: string;
  status: string;
  detectedAt: string;
  description?: string | null;
};

export type ClinicOpsSnapshot = {
  billingFindings: BillingReconciliationFinding[];
  patientFindings: PatientReconciliationFinding[];
  appointmentFindings: AppointmentReconciliationFinding[];
  crossDomain: {
    billing: { finding_count: number; critical_count: number };
    patients: { finding_count: number; critical_count: number };
    notifications: { finding_count: number; critical_count: number };
    appointments: { finding_count: number; critical_count: number };
  };
  alerts: {
    deadLetters: number;
    failedDeliveries: number;
    queueDrift: number;
    retentionFindings: number;
  };
  deliveryAudit: NotificationDeliveryAuditRow[];
  operationalFeed: Array<{
    id: string;
    at: string;
    kind: string;
    summary: string;
  }>;
};

function defaultWindow() {
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
}

async function tryLoad<T>(loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

export const clinicOpsService = {
  async getSnapshot(): Promise<ClinicOpsSnapshot> {
    try {
      const { tenantId } = getTenantContext();
      const { windowStart, windowEnd } = defaultWindow();

      const [
        billingOps,
        patientFindings,
        appointmentFindings,
        patientSummary,
        notificationSummary,
        appointmentSummary,
        deliveryAudit,
      ] = await Promise.all([
        tryLoad(() => billingReconciliationService.getOpsSnapshot(), { latestRun: null, openFindings: [] }),
        tryLoad(() => patientReconciliationRepository.listOpenFindings(tenantId, 20), []),
        tryLoad(() => appointmentReconciliationRepository.listOpenFindings(tenantId, 20), []),
        tryLoad(() => patientReconciliationRepository.run({ tenantId, windowStart, windowEnd, dryRun: true }), {
          finding_count: 0,
          critical_count: 0,
          warning_count: 0,
          run_id: null,
        }),
        tryLoad(() => notificationReconciliationRepository.run({ tenantId, windowStart, windowEnd, dryRun: true }), {
          finding_count: 0,
          critical_count: 0,
          warning_count: 0,
          run_id: null,
        }),
        tryLoad(() => appointmentReconciliationRepository.run({ tenantId, windowStart, windowEnd, dryRun: true }), {
          finding_count: 0,
          critical_count: 0,
          warning_count: 0,
          run_id: null,
        }),
        tryLoad(() => notificationRepository.listRecentDeliveryAuditEvidence(tenantId, 15), []),
      ]);

      const billingFindingCount = billingOps.openFindings.length;
      const billingCriticalCount = billingOps.openFindings.filter((f) => f.severity === "critical").length;

      const failedDeliveries = deliveryAudit.filter((row) => {
        const status = row.details?.status ?? row.details?.delivery_status ?? row.action;
        return typeof status === "string" && /fail|error|dead/i.test(status);
      }).length;

      const retentionFindings = patientFindings.filter((f) =>
        /retention|archive|policy/i.test(f.finding_code),
      ).length;

      const operationalFeed = [
        ...(billingOps.latestRun ? [{
          id: billingOps.latestRun.id,
          at: billingOps.latestRun.completed_at,
          kind: "Billing reconciliation",
          summary: `${billingOps.latestRun.finding_count} findings (${billingOps.latestRun.critical_count} critical)`,
        }] : []),
        ...billingOps.openFindings.slice(0, 5).map((finding) => ({
          id: finding.id,
          at: finding.detected_at,
          kind: "Billing finding",
          summary: `${finding.finding_code} (${finding.severity})`,
        })),
        ...patientFindings.slice(0, 3).map((finding) => ({
          id: finding.id,
          at: finding.detected_at,
          kind: "Patient finding",
          summary: `${finding.finding_code} (${finding.severity})`,
        })),
        ...appointmentFindings.slice(0, 3).map((finding) => ({
          id: finding.id,
          at: finding.detected_at,
          kind: "Queue finding",
          summary: `${finding.finding_code} (${finding.severity})`,
        })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 20);

      return {
        billingFindings: billingOps.openFindings,
        patientFindings,
        appointmentFindings,
        crossDomain: {
          billing: { finding_count: billingFindingCount, critical_count: billingCriticalCount },
          patients: { finding_count: patientSummary.finding_count, critical_count: patientSummary.critical_count },
          notifications: { finding_count: notificationSummary.finding_count, critical_count: notificationSummary.critical_count },
          appointments: { finding_count: appointmentSummary.finding_count, critical_count: appointmentSummary.critical_count },
        },
        alerts: {
          deadLetters: notificationSummary.critical_count,
          failedDeliveries,
          queueDrift: appointmentSummary.finding_count,
          retentionFindings,
        },
        deliveryAudit,
        operationalFeed,
      };
    } catch (err) {
      throw toServiceError(err, "Failed to load clinic operations snapshot");
    }
  },

  async acknowledgeBillingFinding(findingId: string) {
    return billingReconciliationService.updateFindingStatus(findingId, "ACKNOWLEDGED");
  },
};
