import { describe, expect, it } from "vitest";
import {
  MFA_REQUIRED_ROLES,
  buildMfaComplianceSession,
  getDefaultPrivilegedAuthState,
  userRequiresMfa,
  type AppUser,
} from "@/core/auth/authStore";

const doctorUser: AppUser = {
  id: "u1",
  name: "Dr",
  email: "d@x.com",
  tenantId: "t1",
  tenantSlug: "clinic",
  tenantName: "Clinic",
  tenantStatus: "active",
  tenantRoles: ["doctor"],
  globalRoles: [],
};

describe("MFA compliance policy", () => {
  it("requires MFA for clinical and finance roles", () => {
    expect(userRequiresMfa(doctorUser)).toBe(true);
    expect(MFA_REQUIRED_ROLES).toContain("pharmacist");
    expect(MFA_REQUIRED_ROLES).not.toContain("receptionist");
  });

  it("blocks protected routes until MFA enrollment for required roles", () => {
    const session = buildMfaComplianceSession({
      user: doctorUser,
      privilegedAuth: getDefaultPrivilegedAuthState(),
    });
    expect(session.requiresMfaEnrollment).toBe(true);
    expect(session.canAccessProtectedRoutes).toBe(false);
  });
});
