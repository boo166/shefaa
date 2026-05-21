import { useAuth } from "@/core/auth/authStore";
import { newRequestTraceId, newRuntimeTransitionTraceId } from "@/platform/observability/traceContext";
import { acquireBarrierLease, releaseBarrierLease } from "./barrierLease";
import { consistencyBarrier } from "./consistencyBarrier";
import { coordinationDiagnostics } from "./coordinationDiagnostics";
import { emitCoordinationMetric } from "./coordinationTelemetry";
import { runtimeEpochManager } from "./runtimeEpochManager";
import { runtimeEventBus } from "./runtimeEventBus";
import { transitionJournal } from "./transitionJournal";
import type { RuntimeEpochBumpReason, RuntimeEpochStrategy, RuntimeTransitionKind } from "./types";
import { runtimeHealthStore } from "@/platform/runtime/recovery/runtimeHealthStore";

function schedulePersistTransitionToRemote(transitionId: string, status: string) {
  void import("@/services/runtime/runtimeTransitionLog.repository").then(
    async ({ persistRuntimeTransitionLogRow }) => {
      const e = transitionJournal.getRecent().find((x) => x.transitionId === transitionId);
      if (!e) return;
      await persistRuntimeTransitionLogRow({
        transition_id: e.transitionId,
        runtime_epoch: e.runtimeEpoch,
        transition_type: String(e.transitionType),
        tenant_id: e.tenantId,
        actor_id: e.actorId,
        started_at: new Date(e.startedAt).toISOString(),
        completed_at: e.completedAt != null ? new Date(e.completedAt).toISOString() : null,
        failed_at: e.failedAt != null ? new Date(e.failedAt).toISOString() : null,
        rollback_triggered: e.rollbackTriggered,
        trace_id: e.traceId,
        runtime_transition_trace_id: e.runtimeTransitionTraceId,
        causal_parent_id: e.traceId ?? e.runtimeTransitionTraceId,
        failure_kind: status === "completed" ? "transient" : "stale_context",
        runtime_effect: status === "completed" ? "none" : "reconcile",
        recovery_contract: {
          automatic: status !== "failed",
          retryable: status !== "completed",
          replaySafe: status !== "rolled_back",
          requiresReconciliation: status !== "completed",
          requiresOperator: status === "failed",
        },
        evidence_metadata: {
          operator_visibility: status === "completed" ? "timeline" : "alert",
          replay_safety: status === "rolled_back" ? "unsafe" : "conditional",
        },
        status,
      });
    },
  );
}

export type RuntimeTransitionStep = {
  name: string;
  run: () => void | Promise<void>;
  rollback?: () => void | Promise<void>;
  telemetryTags?: Record<string, string>;
};

function transitionToBumpReason(transition: RuntimeTransitionKind | string): RuntimeEpochBumpReason {
  switch (transition) {
    case "tenant_switch":
      return "tenant_switch";
    case "logout":
      return "auth_boundary";
    case "readonly_enter":
      return "runtime_mode";
    case "auth_recovery":
      return "auth_boundary";
    default:
      return "manual";
  }
}

export type RunRuntimeTransitionInput = {
  /** Stable transition kind for journal / epoch semantics. */
  transition?: RuntimeTransitionKind | string;
  /** Idempotency key for journal + barrier lease. */
  transitionId?: string;
  /** Logical barrier name (depth counter). */
  barrierName: string;
  scope?: { tenantId?: string | null; actorId?: string | null };
  epochStrategy?: RuntimeEpochStrategy;
  /** When true (default), sessionStorage lease prevents conflicting tabs from entering the same barrier. */
  useBarrierLease?: boolean;
  runtimeTransitionTraceId?: string;
  steps: RuntimeTransitionStep[];
  timeoutMs?: number;
  publishStart?: Parameters<typeof runtimeEventBus.publish>[0]["type"];
};

function newTransitionId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}`;
}

/**
 * Multi-system runtime atomicity: leases, barriers, ordered steps, best-effort rollback, journal, telemetry.
 * Not DB atomic — coordinates client-side runtime subsystems. Only the coordination kernel should call this for transitions.
 */
export async function runRuntimeTransition(input: RunRuntimeTransitionInput): Promise<void> {
  const transition = (input.transition ?? "generic") as RuntimeTransitionKind | string;
  const transitionId = input.transitionId ?? newTransitionId();
  const runtimeTransitionTraceId = input.runtimeTransitionTraceId ?? newRuntimeTransitionTraceId();
  const traceId = newRequestTraceId();
  const timeoutMs = input.timeoutMs ?? 60_000;
  const epochStrategy = input.epochStrategy ?? "none";
  const useBarrierLease = input.useBarrierLease ?? true;

  const authSnap = useAuth.getState();
  const tenantId = input.scope?.tenantId ?? authSnap.user?.tenantId ?? null;
  const actorId = input.scope?.actorId ?? authSnap.user?.id ?? null;
  const startEpoch = runtimeEpochManager.getCurrentEpoch();

  coordinationDiagnostics.setActiveTransition(transitionId, String(transition));

  transitionJournal.append({
    transitionId,
    runtimeEpoch: startEpoch,
    transitionType: transition,
    tenantId,
    actorId,
    startedAt: Date.now(),
    rollbackTriggered: false,
    traceId,
    runtimeTransitionTraceId,
    status: "started",
  });

  emitCoordinationMetric("coordination.transition.started", {
    barrier: input.barrierName,
    transition,
    transitionId,
    runtimeTransitionTraceId,
  });

  if (useBarrierLease) {
    acquireBarrierLease(input.barrierName, transitionId);
  }

  consistencyBarrier.enter(input.barrierName);
  const completed: RuntimeTransitionStep[] = [];
  let rollbackTriggered = false;

  if (epochStrategy === "bump_on_start") {
    runtimeEpochManager.bump(transitionToBumpReason(transition), { transition, transitionId });
  }

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`runRuntimeTransition timeout: ${input.barrierName}`)),
      timeoutMs,
    ),
  );

  try {
    if (input.publishStart) {
      runtimeEventBus.publish({
        type: input.publishStart,
        traceId,
        runtimeTransitionTraceId,
        tenantId,
        actorId,
        payload: { barrierName: input.barrierName, transition, transitionId },
      });
    }

    await Promise.race([
      (async () => {
        for (const step of input.steps) {
          await step.run();
          completed.push(step);
        }
      })(),
      timeout,
    ]);

    if (epochStrategy === "bump_on_complete") {
      runtimeEpochManager.bump(transitionToBumpReason(transition), { transition, transitionId });
    }

    transitionJournal.update(transitionId, {
      status: "completed",
      completedAt: Date.now(),
      rollbackTriggered: false,
    });

    emitCoordinationMetric("coordination.transition.completed", {
      barrier: input.barrierName,
      transition,
      transitionId,
      runtimeTransitionTraceId,
      ok: 1,
    });
    schedulePersistTransitionToRemote(transitionId, "completed");
    runtimeHealthStore.setHealth("HEALTHY");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.includes("timeout");
    if (isTimeout) {
      emitCoordinationMetric("coordination.barrier.timeout", {
        barrier: input.barrierName,
        transitionId,
      });
    }

    rollbackTriggered = true;
    transitionJournal.update(transitionId, {
      status: "failed",
      failedAt: Date.now(),
      rollbackTriggered: true,
    });

    emitCoordinationMetric("coordination.transition.failed", {
      barrier: input.barrierName,
      transition,
      transitionId,
      runtimeTransitionTraceId,
      timeout: isTimeout ? 1 : 0,
    });

    emitCoordinationMetric("coordination.transition.rollback", {
      barrier: input.barrierName,
      transitionId,
      runtimeTransitionTraceId,
    });

    for (const step of completed.reverse()) {
      if (!step.rollback) continue;
      try {
        await step.rollback();
      } catch {
        /* best-effort */
      }
    }

    transitionJournal.update(transitionId, { status: "rolled_back", completedAt: Date.now() });

    schedulePersistTransitionToRemote(transitionId, "rolled_back");
    runtimeHealthStore.setHealth("DEGRADED");

    throw err;
  } finally {
    consistencyBarrier.leave(input.barrierName);
    if (useBarrierLease) {
      releaseBarrierLease(input.barrierName, transitionId);
    }
    coordinationDiagnostics.setActiveTransition(null);
  }
}
