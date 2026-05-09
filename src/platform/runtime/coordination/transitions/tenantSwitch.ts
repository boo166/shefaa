import { isSuperAdmin, useAuth, type TenantOverride } from "@/core/auth/authStore";
import { newRequestTraceId, newRuntimeTransitionTraceId } from "@/platform/observability/traceContext";
import { disconnectAllRegisteredRealtime, reconcileAll } from "@/platform/realtime/realtimeRuntime";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { queryClient } from "@/services/query/queryClient.instance";
import { runTenantScopedCacheReset } from "@/services/auth/authSessionOrchestrator";
import { abortAllWorkflowsForTransition } from "../abortAllWorkflows";
import { runtimeEventBus } from "../runtimeEventBus";
import { runtimeMutationGate } from "../runtimeMutationGate";
import { runRuntimeTransition } from "../runRuntimeTransition";

/**
 * Awaitable tenant switch for super-admin: write freeze → workflows → realtime teardown → cache → adopt tenant → refresh → rehydrate → reconcile.
 * Publishes a single {@link TENANT_CONTEXT_CHANGED} after success (epoch bump via event bus).
 */
export async function switchTenantAsync(params: {
  tenant: TenantOverride;
  authTraceId?: string;
}): Promise<void> {
  const auth = useAuth.getState();
  if (!auth.user || !isSuperAdmin(auth.user)) {
    throw new Error("switchTenantAsync requires an authenticated super_admin");
  }

  const prevParts = {
    userId: auth.user.id,
    tenantId: auth.tenantOverride?.id ?? auth.user.tenantId ?? "none",
  };
  const authTraceId = params.authTraceId ?? crypto.randomUUID();
  const runtimeTransitionTraceId = newRuntimeTransitionTraceId();

  await runRuntimeTransition({
    transition: "tenant_switch",
    barrierName: "tenant_transition",
    epochStrategy: "none",
    runtimeTransitionTraceId,
    scope: { tenantId: params.tenant?.id ?? null, actorId: auth.user.id },
    steps: [
      {
        name: "freeze_writes",
        run: () => {
          runtimeMutationGate.freezeWrites("tenant_switch");
        },
        rollback: () => runtimeMutationGate.unfreezeWrites(),
      },
      {
        name: "abort_workflows",
        run: () => abortAllWorkflowsForTransition("tenant_switch"),
      },
      {
        name: "realtime_disconnect",
        run: () => disconnectAllRegisteredRealtime(),
      },
      {
        name: "cache_reset",
        run: async () => {
          await runTenantScopedCacheReset({
            previousPrincipalParts: prevParts,
            authTraceId,
          });
        },
      },
      {
        name: "adopt_tenant",
        run: () => {
          useAuth.getState().applyTenantOverrideAfterCoordination(params.tenant);
        },
      },
      {
        name: "refresh_runtime_mode",
        run: async () => {
          await runtimeModeController.refresh();
        },
      },
      {
        name: "query_rehydrate",
        run: async () => {
          await queryClient.invalidateQueries();
        },
      },
      {
        name: "realtime_reconcile",
        run: () => {
          reconcileAll({ force: true });
        },
      },
      {
        name: "unfreeze_writes",
        run: () => {
          runtimeMutationGate.unfreezeWrites();
        },
        rollback: () => runtimeMutationGate.unfreezeWrites(),
      },
    ],
  });

  const effAfter = params.tenant?.id ?? useAuth.getState().user?.tenantId ?? null;
  runtimeEventBus.publish({
    type: "TENANT_CONTEXT_CHANGED",
    traceId: newRequestTraceId(),
    runtimeTransitionTraceId,
    tenantId: effAfter,
    actorId: useAuth.getState().user?.id,
    payload: { source: "tenant_switch_async" },
  });
}
