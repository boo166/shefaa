/**
 * Normalized platform runtime metrics (no PII). Extend sinks (Sentry/Datadog) via subscribePlatformMetrics.
 */
export type PlatformMetricPayload = Record<string, string | number | boolean | undefined>;

const listeners = new Set<(name: string, payload: PlatformMetricPayload) => void>();

const HIGH_FREQ = new Set([
  "repository_access_start",
  "repository_access_success",
  "repository_access_failure",
  "async_operation_tick",
  "realtime_reconnect_distribution",
]);
let sampleCounter = 0;
const SAMPLE_EVERY = 20;

export function subscribePlatformMetrics(handler: (name: string, payload: PlatformMetricPayload) => void) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

export function emitPlatformMetric(name: string, payload: PlatformMetricPayload = {}) {
  const isDev = Boolean(import.meta.env?.DEV);
  const isTest = typeof process !== "undefined" && Boolean(process.env.VITEST);

  if (HIGH_FREQ.has(name) && !isDev && !isTest) {
    sampleCounter++;
    if (sampleCounter % SAMPLE_EVERY !== 0) return;
  }

  const safe: PlatformMetricPayload = { ...payload };
  for (const h of listeners) {
    try {
      h(name, safe);
    } catch {
      /* ignore */
    }
  }
  if (isDev) {
    console.debug(`[platform-metric] ${name}`, safe);
  }
}

export function emitUnsafeRuntimeBypass(payload: {
  owner: string;
  reason: string;
  expiry: string;
  file: string;
}) {
  emitPlatformMetric("unsafe_runtime_bypass_used", payload);
}

export function emitRepositoryAccessLatency(payload: {
  action: string;
  classification: string;
  durationMs: number;
  ok: boolean;
  code?: string;
}) {
  emitPlatformMetric("repository_access_latency", payload);
}

export const PLATFORM_METRIC_TAXONOMY = {
  policy: {
    capabilityDenied: "policy.capability_denied",
    assuranceRequirementFailed: "policy.assurance_requirement_failed",
    runtimeBlocked: "policy.runtime_blocked",
    overrideUsed: "policy.override_used",
  },
  runtime: { modeTransition: "runtime.mode_transition" },
  workflow: {
    compensationTriggered: "workflow.compensation_triggered",
    resumeTriggered: "workflow.resume_triggered",
  },
  realtime: { reconnectExhausted: "realtime.reconnect_exhausted" },
} as const;
