/**
 * Capability taxonomy (dot-separated). Maps to legacy Permission union via capabilityMap.
 * Prefer capabilities for new code; Permission remains the DB/RPC-era bridge until backend policy engine lands.
 */
export const Capabilities = {
  clinic: {
    manage: "clinic.settings.manage",
    usersManage: "clinic.users.manage",
  },
  dashboard: { view: "dashboard.view" },
  patients: { view: "patients.record.view", manage: "patients.record.manage" },
  appointments: { view: "appointments.view", manage: "appointments.manage" },
  records: { view: "medical_records.view", manage: "medical_records.manage" },
  billing: {
    view: "billing.invoice.view",
    manage: "billing.invoice.manage",
    reports: "billing.reports.view",
  },
  pharmacy: { manage: "pharmacy.manage" },
  laboratory: { manage: "laboratory.manage" },
  reports: { view: "reports.analytics.view" },
  admin: { super: "platform.super_admin" },
} as const;

export type Capability = string;
