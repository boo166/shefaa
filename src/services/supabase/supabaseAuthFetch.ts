import { env } from "@/core/env/env";

const nativeFetch = globalThis.fetch.bind(globalThis);

const LATENCY_SAMPLES_MAX = 40;
const latencySamplesMs: number[] = [];

export function recordHttpLatencyMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return;
  latencySamplesMs.push(ms);
  if (latencySamplesMs.length > LATENCY_SAMPLES_MAX) latencySamplesMs.shift();
}

/** Approximate p95 from recent samples; fallback when empty. */
export function getHttpLatencyP95Ms(): number {
  if (latencySamplesMs.length === 0) return 300;
  const sorted = [...latencySamplesMs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(0.95 * sorted.length) - 1));
  return sorted[idx] ?? 300;
}

/** Threshold for preemptive refresh: max(30s, 2 * p95 latency) in seconds. */
export function getPreemptiveRefreshThresholdSec(): number {
  const p95 = getHttpLatencyP95Ms();
  return Math.max(30, Math.ceil((2 * p95) / 1000));
}

function isAuthTokenUrl(urlStr: string) {
  try {
    const base = env.VITE_SUPABASE_URL;
    const u = new URL(urlStr, base);
    return u.pathname.includes("/auth/v1/token") || u.pathname.includes("/auth/v1/logout");
  } catch {
    return urlStr.includes("/auth/v1/token") || urlStr.includes("/auth/v1/logout");
  }
}

function isEdgeFunctionUrl(urlStr: string) {
  try {
    const base = env.VITE_SUPABASE_URL;
    const u = new URL(urlStr, base);
    return u.pathname.includes("/functions/v1/");
  } catch {
    return urlStr.includes("/functions/v1/");
  }
}

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function sanitizeEndpoint(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "unknown";
  }
}

/**
 * Fetch for Supabase: records latency, centralizes 401 recovery + single retry,
 * and routes 403 denials through one non-refreshing auth boundary.
 */
export function createSupabaseAuthFetch(): typeof fetch {
  return async function supabaseAuthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const urlStr = requestUrlString(input);
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

    const runFetch = () => nativeFetch(input, init);

    let res = await runFetch();
    const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    recordHttpLatencyMs(elapsed);

    if (isAuthTokenUrl(urlStr)) {
      return res;
    }

    if (res.status === 403) {
      try {
        const { authService } = await import("@/services/auth/auth.service");
        await authService.handleForbidden({
          source: "http",
          endpoint: sanitizeEndpoint(urlStr),
          authTraceId: crypto.randomUUID(),
        });
      } catch {
        /* The original 403 is authoritative; callers should handle it without refresh churn. */
      }
      return res;
    }

    if (res.status !== 401 || isEdgeFunctionUrl(urlStr)) {
      return res;
    }

    try {
      const { authService } = await import("@/services/auth/auth.service");
      await authService.handleUnauthorized({
        source: "http",
        endpoint: sanitizeEndpoint(urlStr),
        authTraceId: crypto.randomUUID(),
      });
    } catch {
      return res;
    }

    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    res = await runFetch();
    recordHttpLatencyMs(Math.max(0, (typeof performance !== "undefined" ? performance.now() : Date.now()) - t1));
    return res;
  };
}
