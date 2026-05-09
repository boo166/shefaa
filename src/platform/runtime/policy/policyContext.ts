import { selectEffectiveTenantId, useAuth } from "@/core/auth/authStore";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";

export type RpcPolicyContextEnvelope = {
  requestTraceId?: string;
  operationTraceId?: string;
  actorId?: string;
  tenantId?: string | null;
  sessionVersion?: string | null;
  runtimeModeVersion?: number;
  requiredCapabilities?: string[];
  assuranceLevel?: string | null;
  requiredAssurance?: string | null;
  operationClass?: string;
  runtimeState?: {
    effectiveMode: string;
    version: number;
  };
};

export function buildRpcPolicyContext(ctx: PlatformRepositoryContext): RpcPolicyContextEnvelope {
  const authState = useAuth.getState();
  const tenantId = ctx.tenantId ?? selectEffectiveTenantId(authState);
  const runtimeSnap = runtimeModeController.getSnapshot();

  return {
    requestTraceId: ctx.trace?.requestTraceId,
    operationTraceId: ctx.trace?.operationTraceId,
    actorId: authState.user?.id,
    tenantId,
    sessionVersion: authState.sessionVersion,
    runtimeModeVersion: runtimeSnap.effective.version,
    requiredCapabilities: ctx.requiredCapabilities,
    assuranceLevel: authState.privilegedAuth?.currentLevel ?? null,
    requiredAssurance: ctx.requiredAssurance ?? null,
    operationClass: ctx.classification ?? "readonly",
    runtimeState: {
      effectiveMode: runtimeSnap.effective.effectiveMode,
      version: runtimeSnap.effective.version,
    },
  };
}

