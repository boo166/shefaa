import { expect, test } from "@playwright/test";
import {
  getStagingAuthConfig,
  signInStagingUser,
  skipWithoutStagingAuth,
} from "./helpers/config";

test.describe("staging chaos drills 7-8", () => {
  test("scenario 7: dry billing reconciliation after simulated payment window is clean", async () => {
    const config = getStagingAuthConfig();
    skipWithoutStagingAuth(config);

    const { client } = await signInStagingUser(config.adminEmail, config.adminPassword, config);
    const { data: profile } = await client.from("profiles").select("tenant_id").limit(1).maybeSingle();
    test.skip(!profile?.tenant_id, "No tenant profile for billing reconciliation drill.");

    const { data, error } = await client.rpc("run_billing_reconciliation", {
      _tenant_id: profile.tenant_id,
      _window_start: new Date(Date.now() - 86_400_000).toISOString(),
      _window_end: new Date().toISOString(),
      _dry_run: true,
    });

    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(Number(row?.critical_count ?? 0)).toBe(0);
  });

  test("scenario 8: cross-tenant reconciliation is denied during tenant switch probe", async () => {
    const config = getStagingAuthConfig();
    skipWithoutStagingAuth(config);
    test.skip(!config.foreignTenantId, "Set STAGING_FOREIGN_TENANT_ID for tenant switch chaos drill.");

    const { client } = await signInStagingUser(config.adminEmail, config.adminPassword, config);
    const { error } = await client.rpc("run_billing_reconciliation", {
      _tenant_id: config.foreignTenantId,
      _window_start: new Date(Date.now() - 86_400_000).toISOString(),
      _window_end: new Date().toISOString(),
      _dry_run: true,
    });

    expect(error).toBeTruthy();
    expect([error?.code, error?.message].join(" ")).toMatch(/42501|tenant mismatch|forbidden/i);
  });
});
