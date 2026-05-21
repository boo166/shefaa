import { describe, expect, it } from "vitest";
import { assertCertifiedRepositoryDescribe, assertRepositoryDescribe } from "../repositoryDescribe";

import { adminRepository } from "@/services/admin/admin.repository";
import { appointmentRepository } from "@/services/appointments/appointment.repository";
import { billingRepository } from "@/services/billing/billing.repository";
import { billingReconciliationRepository } from "@/services/billing/billingReconciliation.repository";
import { eventOutboxRepository } from "@/services/events/eventOutbox.repository";
import { auditLogRepository } from "@/services/settings/audit.repository";
import { searchRepository } from "@/services/search/search.repository";
import { clientErrorLogRepository } from "@/services/observability/clientErrorLog.repository";
import { portalRepository } from "@/services/portal/portal.repository";
import { reportRepository } from "@/services/reports/report.repository";
import { patientRepository } from "@/services/patients/patient.repository";
import { medicalRecordsRepository } from "@/services/patients/medicalRecords.repository";
import { patientDocumentsRepository } from "@/services/patients/patientDocuments.repository";
import { notificationRepository } from "@/services/notifications/notification.repository";

describe("repository.describe metadata", () => {
  it("exists and matches contract for converged repositories", () => {
    const repos = [
      adminRepository,
      appointmentRepository,
      auditLogRepository,
      billingRepository,
      billingReconciliationRepository,
      clientErrorLogRepository,
      eventOutboxRepository,
      searchRepository,
      portalRepository,
      reportRepository,
      patientRepository,
      medicalRecordsRepository,
      patientDocumentsRepository,
      notificationRepository,
    ] as any[];
    for (const repo of repos) {
      expect(typeof repo.describe).toBe("function");
      const meta = repo.describe();
      expect(() => assertRepositoryDescribe(meta)).not.toThrow();
    }
  });

  it("documents notifications as gateway-converged but still not evidence-certified", () => {
    expect(notificationRepository.describe?.()).toMatchObject({
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      exceptions: [
        expect.stringContaining("payload-bearing through the realtime gateway"),
      ],
    });
  });

  it("requires stronger guarantees before a repository may claim certification", () => {
    expect(() => assertCertifiedRepositoryDescribe({
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: false,
      recoveryAware: false,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: ["example.capability"],
    })).not.toThrow();

    expect(() => assertCertifiedRepositoryDescribe({
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: false,
      capabilityAware: true,
      reconciliationAware: false,
      recoveryAware: false,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: ["example.capability"],
    })).toThrow(/runtimeAware/);
  });
});
