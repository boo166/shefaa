import { describe, expect, it } from "vitest";
import { evaluateAuthorize } from "../authorize";

const clinicAdmin = {
  id: "user-1",
  tenantId: "tenant-a",
  globalRoles: [] as ("super_admin")[],
  tenantRoles: ["clinic_admin"] as ("clinic_admin")[],
  tenantStatus: "active" as const,
};

describe("evaluateAuthorize", () => {
  it("denies when unauthenticated", () => {
    const r = evaluateAuthorize({
      actor: null,
      tenantOverride: null,
      sessionVersion: null,
      hasPermission: () => true,
      anyOfPermissions: ["view_billing"],
    });
    expect(r).toEqual({ ok: false, code: "unauthenticated" });
  });

  it("denies tenant mismatch for scoped resource", () => {
    const r = evaluateAuthorize({
      actor: clinicAdmin,
      tenantOverride: null,
      sessionVersion: "sv1",
      hasPermission: () => true,
      anyOfPermissions: ["manage_billing"],
      context: { resourceTenantId: "tenant-b" },
    });
    expect(r).toEqual({ ok: false, code: "tenant_mismatch" });
  });

  it("allows when permission matches", () => {
    const r = evaluateAuthorize({
      actor: clinicAdmin,
      tenantOverride: null,
      sessionVersion: "sv1",
      hasPermission: (p) => p === "view_billing",
      anyOfPermissions: ["view_billing"],
      context: { resourceTenantId: "tenant-a" },
    });
    expect(r).toEqual({ ok: true });
  });

  it("resolves capability to permission", () => {
    const r = evaluateAuthorize({
      actor: clinicAdmin,
      tenantOverride: null,
      sessionVersion: "sv1",
      hasPermission: (p) => p === "manage_billing",
      anyOfCapabilities: ["billing.invoice.manage"],
    });
    expect(r).toEqual({ ok: true });
  });

  it("denies unknown capability", () => {
    const r = evaluateAuthorize({
      actor: clinicAdmin,
      tenantOverride: null,
      sessionVersion: "sv1",
      hasPermission: () => true,
      capability: "unknown.capability",
    });
    expect(r).toEqual({ ok: false, code: "unknown_capability" });
  });
});
