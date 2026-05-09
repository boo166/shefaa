import type { Page } from "@playwright/test";

/** Force offline to trigger realtime disconnect paths (best-effort). */
export async function forceWebsocketDisconnect(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

export async function restoreNetwork(page: Page): Promise<void> {
  await page.context().setOffline(false);
}
