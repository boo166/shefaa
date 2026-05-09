export type AsyncPolicyProfile =
  | "financial"
  | "tenantCritical"
  | "realtime"
  | "readonly"
  | "backgroundJob";

export type AsyncPolicy = {
  maxRetries: number;
  timeoutMs: number;
  retryDelayMs: number;
  strictStaleContext: boolean;
  telemetrySeverity: "info" | "warning" | "critical";
};

export const ASYNC_POLICY_PROFILES: Record<AsyncPolicyProfile, AsyncPolicy> = {
  financial: {
    maxRetries: 1,
    timeoutMs: 120_000,
    retryDelayMs: 800,
    strictStaleContext: true,
    telemetrySeverity: "critical",
  },
  tenantCritical: {
    maxRetries: 1,
    timeoutMs: 60_000,
    retryDelayMs: 500,
    strictStaleContext: true,
    telemetrySeverity: "warning",
  },
  realtime: {
    maxRetries: 2,
    timeoutMs: 20_000,
    retryDelayMs: 300,
    strictStaleContext: true,
    telemetrySeverity: "warning",
  },
  readonly: {
    maxRetries: 2,
    timeoutMs: 30_000,
    retryDelayMs: 250,
    strictStaleContext: false,
    telemetrySeverity: "info",
  },
  backgroundJob: {
    maxRetries: 3,
    timeoutMs: 180_000,
    retryDelayMs: 1_000,
    strictStaleContext: false,
    telemetrySeverity: "warning",
  },
};
