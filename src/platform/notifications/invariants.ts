import { assertRuntimeInvariant } from "@/platform/runtime/invariants";

/** Ensures notification idempotency key is present for deduplicated dispatch (expand when worker lands). */
export function assertNotificationDedupKey(idempotencyKey: string | null | undefined): void {
  assertRuntimeInvariant({
    domain: "notifications",
    invariant: "notification_dedup_key_present",
    expected: "non-empty",
    actual: idempotencyKey && idempotencyKey.length > 0 ? "non-empty" : "empty",
  });
}
