/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  readonly VITE_CAPTCHA_SITE_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_AUTH_KILL_SWITCH?: string;
  readonly VITE_AUTH_RUNTIME_INVARIANTS?: "off" | "report" | "throw";
  /** Enable super-admin runtime governance console outside local dev. */
  readonly VITE_RUNTIME_OPS_CONSOLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
