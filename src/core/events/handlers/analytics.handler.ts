import type { DomainEvent, DomainEventName } from "../event-types";
import { enqueueJob, buildJob } from "@/core/jobs";
import { getPrimaryRole, useAuth } from "@/core/auth/authStore";

const ANALYTICS_EVENTS: DomainEventName[] = [
  "AppointmentCreated",
  "InvoicePaid",
  "LabResultUploaded",
  "InsuranceClaimTransitioned",
  "MedicationStockAdjusted",
  "PrescriptionIssued",
  "PatientRegistered",
];

export function registerAnalyticsHandlers(
  on: (name: DomainEventName, handler: (event: DomainEvent) => void | Promise<void>) => void,
) {
  ANALYTICS_EVENTS.forEach((name) => {
    on(name, async (event) => {
      const role = getPrimaryRole(useAuth.getState().user);
      if (role && !["clinic_admin", "super_admin"].includes(role)) {
        return;
      }
      enqueueJob(
        buildJob("RefreshMaterializedViews", {
          tenant_id: event.metadata.tenantId,
          event: name,
        }),
      );
    });
  });
}
