import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROLE_PERMISSIONS, type Permission, type Role } from "@/core/auth/authStore";

type DomainAction = "read" | "write" | "delete" | "approve" | "export";

type MatrixEntry = {
  role: Role;
  domain: string;
  action: DomainAction;
  allowed: boolean;
};

const DOMAIN_PERMISSIONS: Record<string, Partial<Record<DomainAction, Permission[]>>> = {
  patients: {
    read: ["view_patients", "manage_patients", "super_admin"],
    write: ["manage_patients", "super_admin"],
    delete: ["manage_clinic", "super_admin"],
    export: ["manage_clinic", "super_admin"],
  },
  appointments: {
    read: ["view_appointments", "manage_appointments", "super_admin"],
    write: ["manage_appointments", "super_admin"],
    delete: ["manage_clinic", "super_admin"],
    export: ["view_reports", "super_admin"],
  },
  billing: {
    read: ["view_billing", "manage_billing", "super_admin"],
    write: ["manage_billing", "super_admin"],
    delete: ["manage_clinic", "super_admin"],
    approve: ["manage_billing", "super_admin"],
    export: ["view_reports", "super_admin"],
  },
  insurance: {
    read: ["view_billing", "manage_billing", "super_admin"],
    write: ["manage_billing", "super_admin"],
    delete: ["manage_clinic", "super_admin"],
    approve: ["manage_clinic", "super_admin"],
    export: ["view_reports", "super_admin"],
  },
  inventory: {
    read: ["manage_pharmacy", "super_admin"],
    write: ["manage_pharmacy", "super_admin"],
    delete: ["manage_clinic", "super_admin"],
    export: ["view_reports", "super_admin"],
  },
  labs: {
    read: ["manage_laboratory", "view_medical_records", "super_admin"],
    write: ["manage_laboratory", "super_admin"],
    delete: ["manage_clinic", "super_admin"],
    approve: ["manage_laboratory", "super_admin"],
    export: ["view_reports", "super_admin"],
  },
  reports: {
    read: ["view_reports", "super_admin"],
    export: ["view_reports", "super_admin"],
  },
  settings: {
    read: ["manage_clinic", "super_admin"],
    write: ["manage_clinic", "super_admin"],
    delete: ["super_admin"],
  },
};

function roleAllows(role: Role, permissions: Permission[] | undefined): boolean {
  if (!permissions?.length) return false;
  const granted = new Set(ROLE_PERMISSIONS[role] ?? []);
  return permissions.some((permission) => granted.has(permission));
}

function buildMatrix(): MatrixEntry[] {
  const roles = Object.keys(ROLE_PERMISSIONS) as Role[];
  const entries: MatrixEntry[] = [];

  for (const role of roles) {
    for (const [domain, actions] of Object.entries(DOMAIN_PERMISSIONS)) {
      for (const [action, permissions] of Object.entries(actions) as Array<[DomainAction, Permission[]]>) {
        entries.push({
          role,
          domain,
          action,
          allowed: roleAllows(role, permissions),
        });
      }
    }
  }

  return entries;
}

describe("rbac certification matrix drift guard", () => {
  const matrix = buildMatrix();

  it("documents all eight tenant-facing roles including pharmacist and lab_technician", () => {
    expect(Object.keys(ROLE_PERMISSIONS)).toEqual(expect.arrayContaining([
      "super_admin",
      "clinic_admin",
      "doctor",
      "receptionist",
      "nurse",
      "accountant",
      "pharmacist",
      "lab_technician",
    ]));
  });

  it("allows receptionist patient write but not billing write", () => {
    expect(matrix.find((e) => e.role === "receptionist" && e.domain === "patients" && e.action === "write")?.allowed).toBe(true);
    expect(matrix.find((e) => e.role === "receptionist" && e.domain === "billing" && e.action === "write")?.allowed).toBe(false);
  });

  it("allows pharmacist inventory write and blocks lab write", () => {
    expect(matrix.find((e) => e.role === "pharmacist" && e.domain === "inventory" && e.action === "write")?.allowed).toBe(true);
    expect(matrix.find((e) => e.role === "pharmacist" && e.domain === "labs" && e.action === "write")?.allowed).toBe(false);
  });

  it("allows lab_technician lab write and blocks inventory write", () => {
    expect(matrix.find((e) => e.role === "lab_technician" && e.domain === "labs" && e.action === "write")?.allowed).toBe(true);
    expect(matrix.find((e) => e.role === "lab_technician" && e.domain === "inventory" && e.action === "write")?.allowed).toBe(false);
  });

  it("matches documented matrix file for critical billing and appointment rows", () => {
    const doc = readFileSync(resolve(process.cwd(), "docs/ops/rbac-certification-matrix.md"), "utf8");
    expect(doc).toContain("pharmacist");
    expect(doc).toContain("lab_technician");
    expect(matrix.find((e) => e.role === "accountant" && e.domain === "billing" && e.action === "write")?.allowed).toBe(true);
    expect(matrix.find((e) => e.role === "nurse" && e.domain === "appointments" && e.action === "write")?.allowed).toBe(false);
  });
});
