/**
 * Logical attachment lifecycle (storage row may only expose deleted_at today).
 * Transitions: uploaded → available (metadata persisted) → archived (soft-delete) → purged (storage + row removed).
 */
export type PatientDocumentLifecycle = "uploaded" | "available" | "archived" | "purged";

export const PATIENT_DOCUMENT_LIFECYCLE_ORDER: readonly PatientDocumentLifecycle[] = [
  "uploaded",
  "available",
  "archived",
  "purged",
] as const;
