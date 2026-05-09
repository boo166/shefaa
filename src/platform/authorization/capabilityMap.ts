import type { Permission } from "@/core/auth/authStore";
import type { Capability } from "./capabilities";

/** Maps each capability to the minimal legacy Permission required today (server must still enforce). */
export const CAPABILITY_TO_PERMISSION: Record<string, Permission> = {
  "clinic.settings.manage": "manage_clinic",
  "clinic.users.manage": "manage_users",
  "dashboard.view": "view_dashboard",
  "patients.record.view": "view_patients",
  "patients.record.manage": "manage_patients",
  "appointments.view": "view_appointments",
  "appointments.manage": "manage_appointments",
  "medical_records.view": "view_medical_records",
  "medical_records.manage": "manage_medical_records",
  "billing.invoice.view": "view_billing",
  "billing.invoice.manage": "manage_billing",
  "billing.reports.view": "view_reports",
  "pharmacy.manage": "manage_pharmacy",
  "laboratory.manage": "manage_laboratory",
  "reports.analytics.view": "view_reports",
  "platform.super_admin": "super_admin",
};

export function permissionForCapability(capability: Capability): Permission | null {
  return CAPABILITY_TO_PERMISSION[capability] ?? null;
}
