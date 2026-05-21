import type { DomainEvent, DomainEventName } from "../event-types";
import { auditLogService } from "@/services/settings/audit.service";

const EVENT_ACTIONS: Record<DomainEventName, { action: string; entityType: string }> = {
  AppointmentCreated: { action: "appointment_created", entityType: "appointment" },
  InvoicePaid: { action: "invoice_paid", entityType: "invoice" },
  LabResultUploaded: { action: "lab_result_uploaded", entityType: "lab_order" },
  InsuranceClaimTransitioned: { action: "insurance_claim_transitioned", entityType: "insurance_claim" },
  MedicationStockAdjusted: { action: "medication_stock_adjusted", entityType: "medication" },
  PrescriptionIssued: { action: "prescription_issued", entityType: "prescription" },
  PatientRegistered: { action: "patient_registered", entityType: "patient" },
};

function resolveEntityId(event: DomainEvent) {
  switch (event.name) {
    case "AppointmentCreated":
      return event.payload.appointmentId;
    case "InvoicePaid":
      return event.payload.invoiceId;
    case "LabResultUploaded":
      return event.payload.labOrderId;
    case "InsuranceClaimTransitioned":
      return event.payload.claimId;
    case "MedicationStockAdjusted":
      return event.payload.medicationId;
    case "PrescriptionIssued":
      return event.payload.prescriptionId;
    case "PatientRegistered":
      return event.payload.patientId;
    default:
      return null;
  }
}

export function registerAuditHandlers(on: (name: DomainEventName, handler: (event: DomainEvent) => void | Promise<void>) => void) {
  (Object.keys(EVENT_ACTIONS) as DomainEventName[]).forEach((name) => {
    on(name, async (event) => {
      const mapping = EVENT_ACTIONS[name];
      await auditLogService.logEvent({
        tenant_id: event.metadata.tenantId,
        user_id: event.metadata.userId ?? "00000000-0000-0000-0000-000000000000",
        action: mapping.action,
        action_type: mapping.action,
        entity_type: mapping.entityType,
        resource_type: mapping.entityType,
        entity_id: resolveEntityId(event),
        details: event.payload as Record<string, unknown>,
        request_id: event.metadata.requestId ?? null,
      });
    });
  });
}
