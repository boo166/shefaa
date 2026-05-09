/**
 * Client UI boundary checks (dev/test throw; prod warn).
 * Use after navigation, tenant switch, or optimistic updates.
 */
import { assertRuntimeInvariant } from "./invariants";

export type UiInvariantInput = {
  invariant: string;
  expected: unknown;
  actual: unknown;
  message?: string;
};

export function assertUiInvariant(input: UiInvariantInput): void {
  assertRuntimeInvariant({
    domain: "ui",
    invariant: input.invariant,
    expected: input.expected,
    actual: input.actual,
    message: input.message,
  });
}
