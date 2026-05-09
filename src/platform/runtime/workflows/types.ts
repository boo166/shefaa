import type { PlatformTraceIds } from "@/platform/observability/traceContext";

export type WorkflowCheckpoint = {
  workflowId: string;
  workflowVersion: number;
  workflowTraceId: string;
  stepIndex: number;
  updatedAt: string;
  trace: PlatformTraceIds;
  /** Epoch captured at workflow start; steps must stay on this epoch. */
  runtimeEpoch?: number;
  payload?: Record<string, unknown>;
};

export type WorkflowFailureClassification =
  | "transient"
  | "conflict"
  | "policy_blocked"
  | "unauthorized"
  | "validation"
  | "stale_epoch"
  | "tenant_mismatch"
  | "unknown";

export type WorkflowResumeStrategy = "restart" | "resume_from_checkpoint" | "manual";

