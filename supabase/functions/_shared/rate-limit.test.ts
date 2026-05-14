import { checkRateLimit } from "./rate-limit.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function mockClient(allowed: boolean) {
  return {
    rpc: async () => ({ data: allowed, error: null }),
  } as any;
}

Deno.test("checkRateLimit denies through Upstash and returns retry-after", async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.set("RATE_LIMIT_BACKEND", "upstash");
  Deno.env.set("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
  Deno.env.set("UPSTASH_REDIS_REST_TOKEN", "token");
  globalThis.fetch = async () =>
    new Response(JSON.stringify([
      { result: 4 },
      { result: 1 },
      { result: 55 },
    ]), { status: 200 });

  try {
    const result = await checkRateLimit({
      client: mockClient(true),
      key: "test-deny",
      maxHits: 3,
      windowSeconds: 60,
    });

    assertEquals(result.allowed, false);
    assertEquals(result.backend, "upstash");
    assertEquals(result.retryAfter, 55);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("checkRateLimit falls back to DB when Upstash fails", async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.set("RATE_LIMIT_BACKEND", "upstash");
  Deno.env.set("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
  Deno.env.set("UPSTASH_REDIS_REST_TOKEN", "token");
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });

  try {
    const result = await checkRateLimit({
      client: mockClient(true),
      key: "test-fallback",
      maxHits: 3,
      windowSeconds: 60,
    });

    assertEquals(result.allowed, true);
    assertEquals(result.backend, "db");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("checkRateLimit fail-opens when Redis and DB are unavailable", async () => {
  const originalFetch = globalThis.fetch;
  Deno.env.set("RATE_LIMIT_BACKEND", "upstash");
  Deno.env.set("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
  Deno.env.set("UPSTASH_REDIS_REST_TOKEN", "token");
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });

  try {
    const result = await checkRateLimit({
      client: {
        rpc: async () => ({ data: null, error: { message: "db unavailable" } }),
      } as any,
      key: "test-fail-open",
      maxHits: 3,
      windowSeconds: 60,
      failOpen: true,
    });

    assertEquals(result.allowed, true);
    assertEquals(result.backend, "db");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
