/**
 * Thin platform SDK façade — re-exports only; business logic stays in services/features.
 */
import { authorize, evaluateAuthorize } from "@/platform/authorization/authorize";
import { platformRepository } from "@/platform/data/platformRepository";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import * as traceContext from "@/platform/observability/traceContext";
import { createAsyncOperation } from "@/platform/runtime/async/createAsyncOperation";
import {
  consistencyBarrier,
  createRuntimeSnapshot,
  initializeRuntimeCoordination,
  restoreRuntimeSnapshot,
  runRuntimeTransition,
  runtimeEpochManager,
  runtimeEventBus,
  switchTenantAsync,
} from "@/platform/runtime/coordination";
import { resolveRecoveryPolicy } from "@/platform/runtime/policy";
import { runtimeHealthStore, transitionRecoveryManager } from "@/platform/runtime/recovery";
import {
  resolveEffectiveRuntimeState,
  resolveSemanticAction,
} from "@/platform/runtime/semantics";
import {
  getRuntimeEpoch,
  getRuntimeOpsSnapshot,
  getRuntimeTopologySnapshot,
  serverRuntimeOpsSnapshot,
  subscribeRuntimeEpoch,
  subscribeRuntimeOps,
  subscribeRuntimeTopology,
} from "@/platform/runtime/ops/runtimeOpsReadModel";
import { getRealtimeRegistryDiagnostics, subscribeEntity } from "@/platform/realtime/realtimeRuntime";

export const platform = {
  data: { repository: platformRepository },
  authz: { authorize, evaluateAuthorize },
  async: { createOperation: createAsyncOperation },
  coordination: {
    initialize: initializeRuntimeCoordination,
    epoch: runtimeEpochManager,
    eventBus: runtimeEventBus,
    barrier: consistencyBarrier,
    runTransition: runRuntimeTransition,
    snapshot: createRuntimeSnapshot,
    restoreSnapshot: restoreRuntimeSnapshot,
    switchTenantAsync,
    recovery: { bootstrap: transitionRecoveryManager.bootstrap, health: runtimeHealthStore },
    policy: { resolveRecoveryPolicy },
    semantics: { resolveSemanticAction, resolveEffectiveRuntimeState },
    readModels: {
      getTopologySnapshot: getRuntimeTopologySnapshot,
      subscribeTopology: subscribeRuntimeTopology,
      getOpsSnapshot: getRuntimeOpsSnapshot,
      subscribeOps: subscribeRuntimeOps,
      serverOpsSnapshot: serverRuntimeOpsSnapshot,
      getEpoch: getRuntimeEpoch,
      subscribeEpoch: subscribeRuntimeEpoch,
    },
  },
  realtime: { subscribeEntity, getRegistryDiagnostics: getRealtimeRegistryDiagnostics },
  observability: { emitMetric: emitPlatformMetric, trace: traceContext },
};
