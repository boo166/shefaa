import { randomUUID } from "crypto";
import { ASYNC_POLICY_PROFILES } from "./asyncPolicyProfiles";
import type { ResolveRuntimePolicyInput, ResolvedRuntimePolicy, RuntimeMode } from "./runtimePolicy";

function modeAllowsWrites(mode: RuntimeMode): boolean {
  return mode === "NORMAL" || mode === "DEGRADED" || mode === "RECOVERY";
}

export function resolveRuntimePolicy(input: ResolveRuntimePolicyInput): ResolvedRuntimePolicy {
  const decisionReasons: ResolvedRuntimePolicy["decisionReasons"] = [];

  const profile =
    input.operationClass === "financial"
      ? "financial"
      : input.operationClass === "tenant-critical"
        ? "tenantCritical"
        : input.operationClass === "critical"
          ? "tenantCritical"
          : input.operationClass === "eventual"
            ? "readonly"
            : "readonly";

  const asyncPolicy = ASYNC_POLICY_PROFILES[profile];

  const writeAllowed = modeAllowsWrites(input.runtimeState.effectiveMode);
  if (!writeAllowed) {
    decisionReasons.push("runtime_mode_blocked");
  }

  const resolved: ResolvedRuntimePolicy = {
    decisionId: randomUUID(),
    decisionReasons,
    writeAllowed,
    retryPolicy: { maxRetries: asyncPolicy.maxRetries, retryDelayMs: asyncPolicy.retryDelayMs },
    timeoutBudgetMs: asyncPolicy.timeoutMs,
    replayPolicy: input.operationClass === "financial" ? "dedup" : "accept",
    telemetrySeverity: asyncPolicy.telemetrySeverity,
    invariantLevel: input.operationClass === "financial" ? "strict" : "basic",
    degradationStrategy: input.runtimeState.effectiveMode === "DEGRADED" ? "fallback" : "normal",
    cachePolicy: input.operationClass === "readonly" ? "normal" : "bypass_cache",
    auditLevel: input.operationClass === "financial" || input.operationClass === "critical" ? "high" : "standard",
  };

  return resolved;
}

export function simulateRuntimePolicy(input: ResolveRuntimePolicyInput): ResolvedRuntimePolicy {
  return resolveRuntimePolicy(input);
}

