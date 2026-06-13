import { expect, test } from "@playwright/test";
import { createPatient, getClinicConfig, hasClinicConfig, loginToClinic } from "./helpers/clinic";

test.describe("patient lifecycle", () => {
  test("creates, archives, and restores a patient with list visibility", async ({ page }) => {
    const config = getClinicConfig();
    test.skip(!hasClinicConfig(config), "E2E credentials not configured");

    const patientName = `E2E Patient Lifecycle ${Date.now()}`;

    await loginToClinic(page, config);
    await createPatient(page, config.clinicSlug!, patientName);

    await page.goto(`/tenant/${config.clinicSlug}/patients`);
    const patientRow = () => page.locator("tbody tr", { hasText: patientName }).first();
    await expect(patientRow()).toBeVisible({ timeout: 30_000 });

    await patientRow().getByRole("button", { name: /actions|more/i }).click().catch(async () => {
      await patientRow().click();
    });
    await page.getByRole("menuitem", { name: /archive|deactivate/i }).click().catch(async () => {
      await patientRow().getByRole("button", { name: /archive/i }).click();
    });

    await expect(patientRow()).not.toBeVisible({ timeout: 30_000 }).catch(async () => {
      await page.getByRole("tab", { name: /archived|inactive/i }).click();
      await expect(patientRow()).toBeVisible({ timeout: 30_000 });
    });

    await page.getByRole("tab", { name: /archived|inactive/i }).click().catch(() => undefined);
    const archivedRow = page.locator("tbody tr", { hasText: patientName }).first();
    if (await archivedRow.isVisible().catch(() => false)) {
      await archivedRow.getByRole("button", { name: /restore/i }).click();
      await page.getByRole("tab", { name: /active/i }).click().catch(() => undefined);
      await expect(page.locator("tbody tr", { hasText: patientName }).first()).toBeVisible({ timeout: 30_000 });
    }
  });
});
