import { reconcileAll } from "@/platform/realtime/realtimeRuntime";
import { transitionJournal } from "@/platform/runtime/coordination/transitionJournal";
import { emitCoordinationMetric } from "@/platform/runtime/coordination/coordinationTelemetry";
import { resolveRecoveryPolicy } from "@/platform/runtime/policy/resolveRecoveryPolicy";
import { runtimeHealthStore } from "./runtimeHealthStore";
import { recoveryOrchestrator } from "./recoveryOrchestrator";

export const transitionRecoveryManager = {
  /** Best-effort recovery on cold start when a transition did not complete in-tab. */
  bootstrap() {
    if (typeof window === "undefined") return;
    const inc = transitionJournal.getLastIncomplete();
    if (!inc) return;

    emitCoordinationMetric("coordination.recovery.started", {
      transitionId: inc.transitionId,
      transitionType: String(inc.transitionType),
    });
    runtimeHealthStore.setHealth("RECOVERING");

    const { strategy } = resolveRecoveryPolicy("transition_incomplete");
    if (strategy === "reconcile") {
      reconcileAll({ force: true });
    }
    recoveryOrchestrator.recover({
      failure: "transition_incomplete",
      tenantId: inc.tenantId,
      actorId: inc.actorId,
      reason: `transition:${inc.transitionType}`,
      traceId: inc.runtimeTransitionTraceId,
    });

    transitionJournal.update(inc.transitionId, {
      status: "failed",
      failedAt: Date.now(),
      rollbackTriggered: false,
    });

    emitCoordinationMetric("coordination.recovery.completed", { transitionId: inc.transitionId });
    runtimeHealthStore.setHealth("DEGRADED");
  },
};
