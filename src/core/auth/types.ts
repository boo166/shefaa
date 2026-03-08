export type Role = "clinic_admin" | "doctor" | "receptionist" | "nurse" | "accountant";

export type Permission =
  | "manage_clinic"
  | "manage_users"
  | "view_dashboard"
  | "manage_patients"
  | "view_patients"
  | "manage_appointments"
  | "view_appointments"
  | "manage_medical_records"
  | "view_medical_records"
  | "manage_billing"
  | "view_billing"
  | "manage_pharmacy"
  | "manage_laboratory"
  | "view_reports";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  clinic_admin: [
    "manage_clinic", "manage_users", "view_dashboard",
    "manage_patients", "view_patients", "manage_appointments", "view_appointments",
    "manage_medical_records", "view_medical_records",
    "manage_billing", "view_billing",
    "manage_pharmacy", "manage_laboratory", "view_reports",
  ],
  doctor: [
    "view_dashboard", "view_patients", "manage_medical_records", "view_medical_records",
    "view_appointments", "manage_appointments",
  ],
  receptionist: [
    "view_dashboard", "view_patients", "manage_patients",
    "manage_appointments", "view_appointments",
  ],
  nurse: [
    "view_dashboard", "view_patients", "view_medical_records", "view_appointments",
  ],
  accountant: [
    "view_dashboard", "manage_billing", "view_billing", "view_reports",
  ],
};

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  tenantId: string;
  avatar?: string;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  logo?: string;
}
