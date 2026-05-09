import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";

export type CoordinationMetricName =
  | "coordination.transition.started"
  | "coordination.transition.completed"
  | "coordination.transition.failed"
  | "coordination.transition.rollback"
  | "coordination.barrier.timeout"
  | "coordination.barrier_wait"
  | "coordination.barrier_cleared"
  | "coordination.barrier.lease_acquired"
  | "coordination.barrier.lease_released"
  | "coordination.barrier.lease_denied"
  | "coordination.barrier.lease_release_skipped"
  | "coordination.event_published"
  | "coordination.event.rejected"
  | "coordination.epoch_bumped"
  | "coordination.stale_epoch_rejected"
  | "coordination.realtime_policy_filtered"
  | "coordination.mutation_freeze"
  | "coordination.write_blocked_freeze"
  | "coordination.recovery.started"
  | "coordination.recovery.completed"
  | "coordination.recovery.failed"
  | "coordination.snapshot.restored";

/** @deprecated Use coordination.transition.* names; kept for one release of dual-emit if needed */
const LEGACY_MAP: Partial<Record<CoordinationMetricName, string>> = {
  "coordination.transition.started": "coordination.transition_start",
  "coordination.transition.completed": "coordination.transition_complete",
  "coordination.transition.rollback": "coordination.transition_rollback",
};

export function emitCoordinationMetric(
  name: CoordinationMetricName,
  payload: Record<string, string | number | boolean | undefined> = {},
) {
  emitPlatformMetric(name, payload);
  const legacy = LEGACY_MAP[name];
  if (legacy) emitPlatformMetric(legacy, payload);
}
