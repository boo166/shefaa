import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/authStore";

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

// Persist dark mode preference to DB
async function saveThemeToDb(userId: string, dark: boolean) {
  await supabase
    .from("user_preferences" as any)
    .upsert({ user_id: userId, dark_mode: dark }, { onConflict: "user_id" });
}

// Load dark mode preference from DB
async function loadThemeFromDb(userId: string): Promise<ThemeMode | null> {
  const { data } = await supabase
    .from("user_preferences" as any)
    .select("dark_mode")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return (data as any).dark_mode ? "dark" : "light";
  return null;
}

export function useDarkMode() {
  const [enabled, setEnabledState] = useState<boolean>(() => getStoredTheme() === "dark");
  const { user } = useAuth();

  // Load preference from DB on mount (if logged in)
  useEffect(() => {
    if (!user?.id) return;
    loadThemeFromDb(user.id).then((dbTheme) => {
      if (dbTheme !== null) {
        setEnabledState(dbTheme === "dark");
        setStoredTheme(dbTheme);
      }
    });
  }, [user?.id]);

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

  const setEnabled = useCallback(
    (next: boolean) => {
      setEnabledState(!!next);
      if (user?.id) saveThemeToDb(user.id, !!next);
    },
    [user?.id]
  );

  const toggle = useCallback(() => {
    setEnabledState((v) => {
      const next = !v;
      if (user?.id) saveThemeToDb(user.id, next);
      return next;
    });
  }, [user?.id]);

  return useMemo(() => ({ enabled, setEnabled, toggle }), [enabled, setEnabled, toggle]);
}
