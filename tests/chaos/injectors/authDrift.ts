import type { Page } from "@playwright/test";

/** Simulate tenant/context drift by corrupting a scoped cache key pattern used in staging tests (optional). */
export async function simulateScopedStorageDrift(page: Page, badKey: string, value: string): Promise<void> {
  await page.evaluate(
    ({ badKey, value }) => {
      window.localStorage.setItem(badKey, value);
    },
    { badKey, value },
  );
}
