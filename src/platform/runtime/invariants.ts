/**
 * Platform runtime invariant assertions.
 * Dev: throw fast. Prod: emit metric + optional containment (caller-defined).
 */
export type RuntimeInvariantDomain =
  | "auth"
  | "authorization"
  | "billing"
  | "realtime"
  | "storage"
  | "notifications"
  | "tenant"
  | "ui"
  | "general";

export type AssertRuntimeInvariantInput = {
  domain: RuntimeInvariantDomain;
  invariant: string;
  expected: unknown;
  actual: unknown;
  message?: string;
};

const invariantListeners = new Set<(input: AssertRuntimeInvariantInput) => void>();

export function subscribeRuntimeInvariantViolations(handler: (input: AssertRuntimeInvariantInput) => void) {
  invariantListeners.add(handler);
  return () => invariantListeners.delete(handler);
}

export function assertRuntimeInvariant(input: AssertRuntimeInvariantInput): void {
  const ok = Object.is(input.expected, input.actual) || input.expected === input.actual;
  if (ok) return;

  const isDev = Boolean(import.meta.env?.DEV);
  const isTest = typeof process !== "undefined" && Boolean(process.env.VITEST);

  for (const h of invariantListeners) {
    try {
      h(input);
    } catch {
      /* ignore */
    }
  }

  const detail = input.message ?? `${input.invariant}: expected ${String(input.expected)}, got ${String(input.actual)}`;
  if (isDev || isTest) {
    throw new Error(`[runtime-invariant:${input.domain}] ${detail}`);
  }

  if (typeof console !== "undefined" && console.warn) {
    console.warn(`[runtime-invariant:${input.domain}]`, detail);
  }
}
