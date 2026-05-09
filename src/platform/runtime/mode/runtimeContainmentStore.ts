import { RuntimeMode, type RuntimeState } from "@/platform/runtime/policy";

type LocalContainment = {
  active: RuntimeState | null;
};

const state: LocalContainment = { active: null };
const listeners = new Set<() => void>();

export function setLocalContainmentOverride(input: {
  mode: RuntimeMode;
  version: number;
  freezes?: RuntimeState["freezes"];
}) {
  state.active = {
    effectiveMode: input.mode,
    version: input.version,
    freezes: input.freezes,
  };
  for (const l of listeners) l();
}

export function clearLocalContainmentOverride() {
  state.active = null;
  for (const l of listeners) l();
}

export function getLocalContainmentOverride(): RuntimeState | null {
  return state.active;
}

export function subscribeLocalContainment(handler: () => void) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

