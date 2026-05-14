export type DomainEventName =
  | "AppointmentCreated"
  | "InvoicePaid"
  | "LabResultUploaded"
  | "PrescriptionIssued"
  | "PatientRegistered";

export type AppointmentCreatedPayload = {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentDate: string;
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
  InvoicePaid: InvoicePaidPayload;
  LabResultUploaded: LabResultUploadedPayload;
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
