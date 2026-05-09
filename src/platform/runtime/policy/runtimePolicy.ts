import type { AuthenticatorAssuranceLevel, TenantStatus } from "@/core/auth/authStore";
import type { RepositoryOperationClassification } from "@/platform/data/platformRepository.context";

export enum RuntimeMode {
  NORMAL = "NORMAL",
  DEGRADED = "DEGRADED",
  READONLY = "READONLY",
  SAFE_MODE = "SAFE_MODE",
  INCIDENT = "INCIDENT",
  RECOVERY = "RECOVERY",
}

export type RuntimeSubsystem =
  | "auth"
  | "billing"
  | "jobs"
  | "realtime"
  | "storage"
  | "notifications";

export type RuntimeFreeze = Partial<Record<RuntimeSubsystem, { reads: boolean; writes: boolean }>>;

export type RuntimeState = {
  effectiveMode: RuntimeMode;
  /** Version for propagation / staleness rejection. */
  version: number;
  /** Optional per-subsystem freezes. */
  freezes?: RuntimeFreeze;
};

export type RuntimeDecisionReason =
  | "capability_denied"
  | "assurance_requirement_failed"
  | "runtime_mode_blocked"
  | "subsystem_frozen"
  | "tenant_suspended"
  | "tenant_mismatch";

export type ResolvedRuntimePolicy = {
  decisionId: string;
  decisionReasons: RuntimeDecisionReason[];
  writeAllowed: boolean;
  retryPolicy: { maxRetries: number; retryDelayMs: number };
  timeoutBudgetMs: number;
  replayPolicy: "reject" | "accept" | "dedup";
  telemetrySeverity: "info" | "warning" | "critical";
  invariantLevel: "none" | "basic" | "strict";
  degradationStrategy: "normal" | "fallback" | "disable_feature";
  cachePolicy: "normal" | "prefer_cache" | "bypass_cache";
  auditLevel: "none" | "standard" | "high";
};

export type ResolveRuntimePolicyInput = {
  operation: string;
  operationClass: RepositoryOperationClassification;
  capability?: string;
  assuranceLevel: AuthenticatorAssuranceLevel;
  runtimeState: RuntimeState;
  tenantTier?: "free" | "starter" | "pro" | "enterprise" | string;
  tenantStatus?: TenantStatus | null;
};

