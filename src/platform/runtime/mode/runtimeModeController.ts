import { selectEffectiveTenantId, useAuth } from "@/core/auth/authStore";
import { newRequestTraceId } from "@/platform/observability/traceContext";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { runtimeEventBus } from "@/platform/runtime/coordination/runtimeEventBus";
import { RuntimeMode, type RuntimeState } from "@/platform/runtime/policy";
import { getLocalContainmentOverride, subscribeLocalContainment } from "./runtimeContainmentStore";
import { runtimeModeRepository } from "./runtimeMode.repository";

type RuntimeModeControllerState = {
  global: RuntimeState | null;
  tenant: RuntimeState | null;
  effective: RuntimeState;
};

const listeners = new Set<(s: RuntimeModeControllerState) => void>();
let state: RuntimeModeControllerState = {
  global: null,
  tenant: null,
  effective: { effectiveMode: RuntimeMode.NORMAL, version: 0 },
};

function resolveEffective(): RuntimeState {
  const containment = getLocalContainmentOverride();
  if (containment) return containment;
  if (state.tenant) return state.tenant;
  if (state.global) return state.global;
  return { effectiveMode: RuntimeMode.NORMAL, version: 0 };
}

function commit(next: Partial<RuntimeModeControllerState>) {
  const prevMode = state.effective.effectiveMode;
  const prevVersion = state.effective.version;
  state = { ...state, ...next, effective: resolveEffective() };
  if (state.effective.effectiveMode !== prevMode || state.effective.version !== prevVersion) {
    emitPlatformMetric("runtime.mode_transition", {
      from: prevMode,
      to: state.effective.effectiveMode,
      version: state.effective.version,
    });
    if (state.effective.effectiveMode === RuntimeMode.INCIDENT || state.effective.effectiveMode === RuntimeMode.SAFE_MODE) {
      runtimeEventBus.publish({
        type: "INCIDENT_MODE_ENTERED",
        traceId: newRequestTraceId(),
        payload: { mode: state.effective.effectiveMode, runtimeModeVersion: state.effective.version },
      });
    } else {
      runtimeEventBus.publish({
        type: "RUNTIME_MODE_CHANGED",
        traceId: newRequestTraceId(),
        payload: { from: prevMode, to: state.effective.effectiveMode, runtimeModeVersion: state.effective.version },
      });
    }
  }
  for (const l of listeners) l(state);
}

export const runtimeModeController = {
  getSnapshot(): RuntimeModeControllerState {
    return {
      ...state,
      effective: resolveEffective(),
    };
  },

  subscribe(handler: (s: RuntimeModeControllerState) => void) {
    listeners.add(handler);
    return () => listeners.delete(handler);
  },

  async refresh() {
    const authState = useAuth.getState();
    const tenantId = selectEffectiveTenantId(authState);
    const [global, tenant] = await Promise.all([
      runtimeModeRepository.getGlobal(),
      tenantId ? runtimeModeRepository.getTenant(tenantId) : Promise.resolve(null),
    ]);
    commit({ global, tenant });
  },

  startAutoRefresh(input?: { intervalMs?: number }) {
    const intervalMs = input?.intervalMs ?? 30_000;
    const id = setInterval(() => void runtimeModeController.refresh(), intervalMs);
    const unsubContainment = subscribeLocalContainment(() => commit({}));
    return () => {
      clearInterval(id);
      unsubContainment();
    };
  },
};

