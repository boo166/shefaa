import { expect, test } from "@playwright/test";
import {
  createAnonClient,
  getStagingAuthConfig,
  signInStagingUser,
  skipWithoutStagingAuth,
} from "./helpers/config";

function expectDenied(error: { code?: string; message?: string } | null) {
  expect(error, "Expected Supabase request to be denied").toBeTruthy();
  expect([error?.code, error?.message].join(" ")).toMatch(/42501|permission denied|not authorized|forbidden|tenant mismatch/i);
}

test.describe("staging RBAC adversarial matrix", () => {
  test("billing reconciliation rejects cross-tenant scope for clinic admin", async () => {
    const config = getStagingAuthConfig();
    skipWithoutStagingAuth(config);
    test.skip(!config.foreignTenantId, "Set STAGING_FOREIGN_TENANT_ID for cross-tenant RBAC probes.");

    const { client } = await signInStagingUser(config.adminEmail, config.adminPassword, config);

    const result = await client.rpc("run_billing_reconciliation", {
      _tenant_id: config.foreignTenantId,
      _window_start: new Date(Date.now() - 86_400_000).toISOString(),
      _window_end: new Date().toISOString(),
      _dry_run: true,
    });

    expectDenied(result.error);
  });

  test("anonymous client cannot invoke pharmacy guard RPCs", async () => {
    const config = getStagingAuthConfig();
    skipWithoutStagingAuth(config);

    const client = createAnonClient(config);
    const result = await client.rpc("assert_can_access_pharmacy");
    expectDenied(result.error);
  });

  test("patient reconciliation rejects explicit foreign tenant", async () => {
    const config = getStagingAuthConfig();
    skipWithoutStagingAuth(config);
    test.skip(!config.foreignTenantId, "Set STAGING_FOREIGN_TENANT_ID for cross-tenant RBAC probes.");

    const { client } = await signInStagingUser(config.adminEmail, config.adminPassword, config);

    const result = await client.rpc("run_patient_reconciliation", {
      p_tenant_id: config.foreignTenantId,
      p_window_start: new Date(Date.now() - 86_400_000).toISOString(),
      p_window_end: new Date().toISOString(),
      p_dry_run: true,
    });

    expectDenied(result.error);
  });
});
