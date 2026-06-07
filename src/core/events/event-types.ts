export type DomainEventName =
  | "AppointmentCreated"
  | "AppointmentLifecycleTransitioned"
  | "InvoicePaid"
  | "LabResultUploaded"
  | "InsuranceClaimTransitioned"
  | "MedicationStockAdjusted"
  | "PrescriptionIssued"
  | "PatientRegistered";

export type AppointmentCreatedPayload = {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string;
};

export type AppointmentLifecycleTransitionedPayload = {
  appointmentId: string;
  queueId?: string | null;
  patientId: string;
  doctorId: string;
  previousAppointmentStatus: string | null;
  appointmentStatus: string;
  previousQueueStatus?: string | null;
  queueStatus?: string | null;
  operation: string;
};

export type InvoicePaidPayload = {
  invoiceId: string;
  patientId: string;
  amount: number;
};

export type LabResultUploadedPayload = {
  labOrderId: string;
  patientId: string;
  doctorId: string;
  status: string;
};

export type InsuranceClaimTransitionedPayload = {
  claimId: string;
  patientId: string;
  previousStatus: string;
  status: string;
};

export type MedicationStockAdjustedPayload = {
  medicationId: string;
  previousStock: number;
  stock: number;
  status: string;
};

export type PrescriptionIssuedPayload = {
  prescriptionId: string;
  patientId: string;
  doctorId: string;
};

export type PatientRegisteredPayload = {
  patientId: string;
  fullName: string;
};

export type DomainEventPayloads = {
  AppointmentCreated: AppointmentCreatedPayload;
  AppointmentLifecycleTransitioned: AppointmentLifecycleTransitionedPayload;
  InvoicePaid: InvoicePaidPayload;
  LabResultUploaded: LabResultUploadedPayload;
  InsuranceClaimTransitioned: InsuranceClaimTransitionedPayload;
  MedicationStockAdjusted: MedicationStockAdjustedPayload;
  PrescriptionIssued: PrescriptionIssuedPayload;
  PatientRegistered: PatientRegisteredPayload;
};

export type DomainEventMetadata = {
  tenantId: string;
  userId?: string | null;
  requestId?: string | null;
  operationTraceId?: string | null;
  workflowTraceId?: string | null;
  runtimeTransitionTraceId?: string | null;
  occurredAt: string;
};

export type DomainEvent<TName extends DomainEventName = DomainEventName> = {
  name: TName;
  payload: DomainEventPayloads[TName];
  metadata: DomainEventMetadata;
};
