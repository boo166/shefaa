import { describe, expect, it } from "vitest";
import { assertRepositoryDescribe } from "../repositoryDescribe";

import { reportRepository } from "@/services/reports/report.repository";
import { patientRepository } from "@/services/patients/patient.repository";
import { medicalRecordsRepository } from "@/services/patients/medicalRecords.repository";
import { patientDocumentsRepository } from "@/services/patients/patientDocuments.repository";
import { notificationRepository } from "@/services/notifications/notification.repository";
import { adminRepository } from "@/services/admin/admin.repository";

describe("repository.describe metadata", () => {
  it("exists and matches contract for converged repositories", () => {
    const repos = [
      reportRepository,
      patientRepository,
      medicalRecordsRepository,
      patientDocumentsRepository,
      notificationRepository,
      adminRepository,
    ] as any[];
    for (const repo of repos) {
      expect(typeof repo.describe).toBe("function");
      const meta = repo.describe();
      expect(() => assertRepositoryDescribe(meta)).not.toThrow();
    }
  });

  it("documents notification realtime as the remaining repository exception", () => {
    expect(notificationRepository.describe?.()).toMatchObject({
      certified: true,
      tenantBound: true,
      staleContextSafe: true,
      metricsEnabled: true,
      exceptions: [
        expect.stringContaining("direct Supabase channel"),
      ],
    });
  });
});
