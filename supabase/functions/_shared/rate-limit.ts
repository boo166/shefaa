import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logInfo, logWarn } from "./logger.ts";

export type RateLimitBackend = "upstash" | "db";

export type RateLimitResult = {
  allowed: boolean;
  remaining?: number;
  retryAfter?: number;
  backend: RateLimitBackend;
};

type CheckRateLimitOptions = {
  client: SupabaseClient;
  key: string;
  maxHits: number;
  windowSeconds: number;
  requestId?: string;
  actionType?: string;
  resourceType?: string;
  failOpen?: boolean;
};

function metricContext(options: CheckRateLimitOptions, metadata: Record<string, unknown> = {}) {
  return {
    request_id: options.requestId,
    action_type: options.actionType ?? "rate_limit",
    resource_type: options.resourceType ?? "security",
    metadata: {
      key: options.key,
      max_hits: options.maxHits,
      window_seconds: options.windowSeconds,
      ...metadata,
    },
  };
}

async function checkDbRateLimit(options: CheckRateLimitOptions): Promise<RateLimitResult> {
  const { data, error } = await options.client.rpc(
    "check_rate_limit",
    {
      _key: options.key,
      _max_hits: options.maxHits,
      _window_seconds: options.windowSeconds,
    },
  );

  if (error) {
    throw new Error(error.message ?? "DB rate limiter unavailable");
  }

  return {
    allowed: Boolean(data),
    backend: "db",
  };
}

async function checkUpstashRateLimit(options: CheckRateLimitOptions): Promise<RateLimitResult> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL")?.replace(/\/+$/, "");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  if (!url || !token) {
    throw new Error("Upstash Redis rate limiter is not configured");
  }

  const redisKey = `rate-limit:${options.key}`;
  const response = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", redisKey],
      ["EXPIRE", redisKey, String(options.windowSeconds), "NX"],
      ["TTL", redisKey],
    ]),
  });

  if (!response.ok) {
    throw new Error(`Upstash Redis rate limiter failed with ${response.status}`);
  }

  const payload = await response.json();
  const hits = Number(payload?.[0]?.result ?? 0);
  const ttl = Number(payload?.[2]?.result ?? options.windowSeconds);
  const allowed = hits <= options.maxHits;
  const remaining = Math.max(options.maxHits - hits, 0);
  const retryAfter = allowed ? undefined : Math.max(ttl, 1);

  return {
    allowed,
    remaining,
    retryAfter,
    backend: "upstash",
  };
}

export async function checkRateLimit(options: CheckRateLimitOptions): Promise<RateLimitResult> {
  const backend = Deno.env.get("RATE_LIMIT_BACKEND") ?? "upstash";
  const failOpen = options.failOpen ?? true;

  if (backend === "db") {
    const result = await checkDbRateLimit(options);
    logInfo("security.rate_limit.backend", metricContext(options, { backend: result.backend }));
    if (!result.allowed) {
      logWarn("security.rate_limit.denied", metricContext(options, { backend: result.backend }));
    }
    return result;
  }

  try {
    const result = await checkUpstashRateLimit(options);
    logInfo("security.rate_limit.backend", metricContext(options, {
      backend: result.backend,
      remaining: result.remaining,
    }));
    if (!result.allowed) {
      logWarn("security.rate_limit.denied", metricContext(options, {
        backend: result.backend,
        retry_after: result.retryAfter,
      }));
    }
    return result;
  } catch (redisError) {
    logWarn("security.rate_limit.redis_failure", metricContext(options, {
      error: redisError instanceof Error ? redisError.message : String(redisError),
    }));

    try {
      const fallback = await checkDbRateLimit(options);
      logWarn("security.rate_limit.fallback", metricContext(options, {
        backend: fallback.backend,
      }));
      if (!fallback.allowed) {
        logWarn("security.rate_limit.denied", metricContext(options, { backend: fallback.backend }));
      }
      return fallback;
    } catch (dbError) {
      logWarn("security.rate_limit.fallback", metricContext(options, {
        backend: "db",
        error: dbError instanceof Error ? dbError.message : String(dbError),
        fail_open: failOpen,
      }));
      if (failOpen) {
        return { allowed: true, backend: "db" };
      }
      throw dbError;
    }
  }
}
