/**
 * Canonical ordering for tenant-scale runtime transitions (see switchTenantAsync).
 * Single DAG reference — do not reorder in features without updating this contract.
 */
export const RUNTIME_TRANSITION_DAG_TENANT_SWITCH = [
  "enter_barrier_lease",
  "freeze_writes",
  "abort_workflows",
  "disconnect_realtime",
  "cache_reset",
  "adopt_tenant_context",
  "refresh_runtime_mode",
  "invalidate_queries",
  "reconcile_realtime",
  "unfreeze_writes",
  "leave_barrier",
  "publish_tenant_context_changed",
] as const;

export type RuntimeTransitionDagStep = (typeof RUNTIME_TRANSITION_DAG_TENANT_SWITCH)[number];
