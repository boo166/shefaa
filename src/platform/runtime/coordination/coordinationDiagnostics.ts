export type CoordinationRejectionReason =
  | "stale_event_age"
  | "duplicate_event_id"
  | "stale_runtime_mode_version"
  | "unknown";

export type CoordinationDiagnosticsState = {
  lastRejection: { reason: CoordinationRejectionReason; detail?: string; at: number } | null;
  lastTransitionId: string | null;
  /** UI transitional containment (e.g. tenant_switch). */
  activeTransitionKind: string | null;
};

const listeners = new Set<(s: CoordinationDiagnosticsState) => void>();
let state: CoordinationDiagnosticsState = {
  lastRejection: null,
  lastTransitionId: null,
  activeTransitionKind: null,
};

function emit() {
  for (const l of listeners) l(state);
}

export const coordinationDiagnostics = {
  getSnapshot(): CoordinationDiagnosticsState {
    return state;
  },

  subscribe(fn: (s: CoordinationDiagnosticsState) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  recordRejection(reason: CoordinationRejectionReason, detail?: string) {
    state = {
      ...state,
      lastRejection: { reason, detail, at: Date.now() },
    };
    emit();
  },

  setActiveTransition(transitionId: string | null, transitionKind?: string | null) {
    state = {
      ...state,
      lastTransitionId: transitionId,
      activeTransitionKind: transitionId ? transitionKind ?? null : null,
    };
    emit();
  },
};
