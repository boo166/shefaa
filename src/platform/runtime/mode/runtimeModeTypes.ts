import type { RuntimeFreeze, RuntimeMode, RuntimeState } from "@/platform/runtime/policy";

export type RuntimeScope = "global" | "tenant" | "user" | "session";
export type PropagationStrategy = "immediate" | "graceful" | "next_refresh";
export type ModeSource = "manual" | "automatic" | "containment";

export type RuntimeModeRecord = {
  runtime_scope: RuntimeScope;
  scope_id: string | null;
  mode: RuntimeMode;
  freezes: RuntimeFreeze | null;
  version: number;
  updated_at: string;
  updated_by: string | null;
  reason: string | null;
  expires_at: string | null;
  propagation_strategy: PropagationStrategy;
  mode_source: ModeSource;
};

export type RuntimeModeSnapshot = {
  global: RuntimeState | null;
  tenant: RuntimeState | null;
  localContainment: RuntimeState | null;
};

