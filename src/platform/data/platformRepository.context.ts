import type { PlatformTraceIds } from "@/platform/observability/traceContext";

export type RepositoryOperationClassification =
  | "critical"
  | "tenant-critical"
  | "financial"
  | "eventual"
  | "readonly";

/**
 * Context for each data-plane operation.
 * This metadata is consumed by middleware for deterministic policy behavior.
 */
export type PlatformRepositoryContext = {
  action: string;
  classification?: RepositoryOperationClassification;
  tenantScoped?: boolean;
  tenantId?: string | null;
  signal?: AbortSignal;
  trace?: Partial<PlatformTraceIds>;
  requiredCapabilities?: string[];
  /** Optional: capability assurance requirement for the operation. */
  requiredAssurance?: "aal1" | "aal2";
  /** Stable operation ID (future kernel-level policy key). */
  operation?: string;
  /** Optional: runtime policy context version (e.g. runtime mode version). */
  policyContextVersion?: number;
  /** Optional: policy decision attached by middleware. */
  runtimePolicy?: unknown;
  /** Optional: subsystem key for freeze semantics. */
  subsystem?: "auth" | "billing" | "jobs" | "realtime" | "storage" | "notifications";
  /** Runtime epoch captured at operation start (coordination kernel). */
  runtimeEpoch?: number;
};
