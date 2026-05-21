import type { DomainEvent, DomainEventName } from "../event-types";
import { notificationService } from "@/services/notifications/notification.service";

const EVENT_TITLES: Record<DomainEventName, string> = {
  AppointmentCreated: "New appointment created",
  InvoicePaid: "Invoice marked as paid",
  LabResultUploaded: "Lab results updated",
  InsuranceClaimTransitioned: "Insurance claim updated",
  MedicationStockAdjusted: "Medication stock adjusted",
  PrescriptionIssued: "New prescription issued",
  PatientRegistered: "New patient registered",
};

export function registerNotificationHandlers(
  on: (name: DomainEventName, handler: (event: DomainEvent) => void | Promise<void>) => void,
) {
  (Object.keys(EVENT_TITLES) as DomainEventName[]).forEach((name) => {
    on(name, async (event) => {
      if (!event.metadata.userId) return;
      await notificationService.create({
        tenant_id: event.metadata.tenantId,
        user_id: event.metadata.userId,
        title: EVENT_TITLES[name],
        body: JSON.stringify(event.payload),
        type: "system_event",
        read: false,
      });
    });
  });
}
