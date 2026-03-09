import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "medflow-theme";

export type ThemeMode = "light" | "dark";

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const raw = safeGetItem(STORAGE_KEY);
  return raw === "dark" ? "dark" : "light";
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function initTheme() {
  if (typeof window === "undefined") return;
  applyTheme(getStoredTheme());
}

export function setStoredTheme(theme: ThemeMode) {
  safeSetItem(STORAGE_KEY, theme);
  applyTheme(theme);
}

export function useDarkMode() {
  const [enabled, setEnabledState] = useState<boolean>(() => getStoredTheme() === "dark");

  // Keep DOM + localStorage in sync
  useEffect(() => {
    setStoredTheme(enabled ? "dark" : "light");
  }, [enabled]);

  // Keep state in sync if theme was changed elsewhere (another tab)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      setEnabledState(getStoredTheme() === "dark");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnabled = useCallback((next: boolean) => setEnabledState(!!next), []);
  const toggle = useCallback(() => setEnabledState((v) => !v), []);

  return useMemo(() => ({ enabled, setEnabled, toggle }), [enabled, setEnabled, toggle]);
}
