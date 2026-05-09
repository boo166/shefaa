import type { Page } from "@playwright/test";

/** Toggle browser online state (Playwright). */
export async function setOnline(page: Page, online: boolean): Promise<void> {
  await page.context().setOffline(!online);
}
