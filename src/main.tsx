import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./design-system/styles/globals.css";
import { useAuth } from "./core/auth/authStore";
import { initTheme } from "./hooks/useDarkMode";
import { initEventHandlers } from "./core/events";
import { initSentry } from "./core/observability/sentry";
import { initAuthOperationalTelemetry } from "./core/observability/authOperationalTelemetry";
import { initializeI18nStore } from "./core/i18n/i18nStore";
import { initializePrivilegedSessionLifecycle } from "./services/auth/privilegedSession.lifecycle";
import { initAuthMultiTabSync, startAuthDriftWatcher } from "./services/auth/authSessionOrchestrator";
import { authRepository } from "./services/auth/auth.repository";
import { initAuthRuntimeInvariants } from "./services/auth/authRuntimeInvariants";
import { initializeRuntimeCoordination } from "./platform/runtime/coordination";

// Apply theme class before anything renders (prevents flash)
initTheme();
void initializeI18nStore();
initSentry();

initAuthMultiTabSync();
initializeRuntimeCoordination();
initAuthOperationalTelemetry();
initAuthRuntimeInvariants();
startAuthDriftWatcher({
  getSession: () => authRepository.getSession(),
  refreshSessionSingleFlight: () => authRepository.refreshSessionSingleFlight(),
});
// Initialize auth state on app load
useAuth.getState().initialize();
initializePrivilegedSessionLifecycle();
void initEventHandlers();

createRoot(document.getElementById("root")!).render(<App />);
