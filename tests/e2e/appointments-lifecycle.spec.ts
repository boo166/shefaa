import { expect, test } from "@playwright/test";
import {
  createPatient,
  expectAppointmentConflictViaApi,
  getClinicConfig,
  hasClinicConfig,
  loginToClinic,
  seedAppointment,
} from "./helpers/clinic";

test.describe("appointment lifecycle", () => {
  test("creates, blocks conflicts, reschedules, and completes an appointment", async ({ page }) => {
    const config = getClinicConfig();
    test.skip(!hasClinicConfig(config), "E2E credentials not configured");

    const patientName = `E2E Lifecycle ${Date.now()}`;
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 2);
    appointmentDate.setHours(15, (Date.now() % 6) * 5, 0, 0);

    await loginToClinic(page, config);
    await createPatient(page, config.clinicSlug!, patientName);
    const seeded = await seedAppointment(config, {
      patientName,
      appointmentDate,
    });

    const created = {
      doctorName: config.doctorName ?? "Dr E2E Automation",
      appointmentDate: seeded.appointmentDate,
    };

    const appointmentRow = () => page.locator("tbody tr", { hasText: patientName }).first();

    await page.goto(`/tenant/${config.clinicSlug}/appointments`);
    await page.getByTestId("appointments-view-list").click();
    await expect(appointmentRow()).toBeVisible({ timeout: 30_000 });
    await expect(appointmentRow()).toContainText(patientName);

    await expectAppointmentConflictViaApi(config, {
      patientName,
      appointmentDate: created.appointmentDate,
      doctorName: created.doctorName,
    });

    await page.getByTestId("appointments-view-list").click();
    await expect(appointmentRow()).toBeVisible({ timeout: 30_000 });

    await appointmentRow().getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("tab", { name: "Waiting room" })).toHaveAttribute("data-state", "active");

    const waitingRoomCard = () =>
      page
        .getByRole("heading", { name: patientName })
        .locator("xpath=ancestor::div[contains(@class,'rounded') and contains(@class,'border')][1]");

    await expect(waitingRoomCard()).toBeVisible({ timeout: 30_000 });
    await waitingRoomCard().getByRole("button", { name: "Call patient" }).click();
    await expect(waitingRoomCard().getByRole("button", { name: "Start visit" })).toBeVisible({ timeout: 30_000 });
    await waitingRoomCard().getByRole("button", { name: "Start visit" }).click();
    await expect(waitingRoomCard().getByRole("button", { name: "Complete visit" })).toBeVisible({ timeout: 30_000 });
    await waitingRoomCard().getByRole("button", { name: "Complete visit" }).click();

    await page.getByRole("tab", { name: "Schedule" }).click();
    await page.getByTestId("appointments-view-list").click();
    await expect(appointmentRow()).toContainText("Completed", { timeout: 30_000 });
  });

  test("cancels a scheduled appointment from the list view", async ({ page }) => {
    const config = getClinicConfig();
    test.skip(!hasClinicConfig(config), "E2E credentials not configured");

    const patientName = `E2E Cancel ${Date.now()}`;
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 3);
    appointmentDate.setHours(11, 0, 0, 0);

    await loginToClinic(page, config);
    await createPatient(page, config.clinicSlug!, patientName);
    await seedAppointment(config, { patientName, appointmentDate });

    await page.goto(`/tenant/${config.clinicSlug}/appointments`);
    await page.getByTestId("appointments-view-list").click();
    const appointmentRow = () => page.locator("tbody tr", { hasText: patientName }).first();
    await expect(appointmentRow()).toBeVisible({ timeout: 30_000 });
    await appointmentRow().getByRole("button", { name: "Cancel" }).click();
    await expect(appointmentRow()).toContainText("Cancelled", { timeout: 30_000 });
  });

  test("marks a checked-in appointment as no-show", async ({ page }) => {
    const config = getClinicConfig();
    test.skip(!hasClinicConfig(config), "E2E credentials not configured");

    const patientName = `E2E NoShow ${Date.now()}`;
    const appointmentDate = new Date();
    appointmentDate.setDate(appointmentDate.getDate() + 4);
    appointmentDate.setHours(12, 0, 0, 0);

    await loginToClinic(page, config);
    await createPatient(page, config.clinicSlug!, patientName);
    await seedAppointment(config, { patientName, appointmentDate });

    await page.goto(`/tenant/${config.clinicSlug}/appointments`);
    await page.getByTestId("appointments-view-list").click();
    const appointmentRow = () => page.locator("tbody tr", { hasText: patientName }).first();
    await expect(appointmentRow()).toBeVisible({ timeout: 30_000 });
    await appointmentRow().getByRole("button", { name: "Check in" }).click();
    await expect(page.getByRole("tab", { name: "Waiting room" })).toHaveAttribute("data-state", "active");

    const waitingRoomCard = () =>
      page
        .getByRole("heading", { name: patientName })
        .locator("xpath=ancestor::div[contains(@class,'rounded') and contains(@class,'border')][1]");

    await expect(waitingRoomCard()).toBeVisible({ timeout: 30_000 });
    await waitingRoomCard().getByRole("button", { name: "Mark no-show" }).click();

    await page.getByRole("tab", { name: "Schedule" }).click();
    await page.getByTestId("appointments-view-list").click();
    await expect(appointmentRow()).toContainText("No-show", { timeout: 30_000 });
  });
});
