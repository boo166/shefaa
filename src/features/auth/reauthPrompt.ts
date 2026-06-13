import { create } from "zustand";
import { authListenerGuards } from "@/services/auth/auth.service";

export type ReauthPromptConfig = {
  title: string;
  description: string;
  actionLabel?: string;
  cancelLabel?: string;
  initialStep?: "password" | "mfa";
};

type ReauthPromptState = {
  request: ReauthPromptConfig | null;
  open: (config: ReauthPromptConfig) => Promise<void>;
  resolve: () => void;
  reject: (reason?: unknown) => void;
};

let pendingResolve: (() => void) | null = null;
let pendingReject: ((reason?: unknown) => void) | null = null;

function setInlineReauthActive(active: boolean) {
  authListenerGuards.suppressMfaRequiredDuringReauth = active;
}

export function isReauthPromptActive(): boolean {
  return useReauthPromptStore.getState().request !== null;
}

export const useReauthPromptStore = create<ReauthPromptState>((set) => ({
  request: null,
  open: (config) =>
    new Promise<void>((resolve, reject) => {
      if (pendingReject) {
        pendingReject(new Error("Re-authentication request replaced"));
      }
      pendingResolve = resolve;
      pendingReject = reject;
      setInlineReauthActive(true);
      set({ request: config });
    }),
  resolve: () => {
    setInlineReauthActive(false);
    pendingResolve?.();
    pendingResolve = null;
    pendingReject = null;
    set({ request: null });
  },
  reject: (reason) => {
    setInlineReauthActive(false);
    pendingReject?.(reason);
    pendingResolve = null;
    pendingReject = null;
    set({ request: null });
  },
}));

export function requestReauthentication(config: ReauthPromptConfig) {
  return useReauthPromptStore.getState().open({ ...config, initialStep: config.initialStep ?? "password" });
}

export function requestMfaSessionVerification(config: ReauthPromptConfig) {
  return useReauthPromptStore.getState().open({ ...config, initialStep: "mfa" });
}
