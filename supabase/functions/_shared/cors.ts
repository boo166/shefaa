export type CorsConfig = {
  allowedOrigins?: string[];
  allowedHeaders?: string[];
  allowedMethods?: string[];
  allowNoOrigin?: boolean;
};

const DEFAULT_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-cron-secret, x-worker-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-region, prefer";

const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "OPTIONS"];

/** Local dev origins merged when APP_ORIGINS is set (disable with ALLOW_LOCAL_DEV_ORIGINS=false). */
const LOCAL_DEV_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:5173",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:5173",
];

function parseOriginList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    return (protocol === "http:" || protocol === "https:") &&
      (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]");
  } catch {
    return false;
  }
}

export function getAllowedOriginsFromEnv(): string[] {
  const configured = parseOriginList(Deno.env.get("APP_ORIGINS") ?? Deno.env.get("APP_ORIGIN"));
  const extra = parseOriginList(Deno.env.get("DEV_ORIGINS"));
  const allowLocalDev = Deno.env.get("ALLOW_LOCAL_DEV_ORIGINS") !== "false";
  const merged = [...configured, ...extra];
  if (allowLocalDev && configured.length > 0) {
    merged.push(...LOCAL_DEV_ORIGINS);
  }
  return [...new Set(merged)];
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  const allowAnyOrigin = allowedOrigins.length === 0;
  const allowLocalDev = Deno.env.get("ALLOW_LOCAL_DEV_ORIGINS") !== "false";
  return allowAnyOrigin
    || allowedOrigins.includes(origin)
    || (allowLocalDev && isLocalDevOrigin(origin));
}

export function buildCorsHeaders(
  origin: string | null,
  config: CorsConfig = {},
  requestedHeaders?: string | null,
): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": requestedHeaders?.trim()
      || config.allowedHeaders
      || DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": (config.allowedMethods ?? DEFAULT_ALLOWED_METHODS).join(","),
    "Access-Control-Max-Age": "86400",
  };

  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }

  return headers;
}

export function enforceCors(req: Request, config: CorsConfig = {}): {
  corsHeaders: HeadersInit;
  origin: string | null;
  errorResponse?: Response;
} {
  const allowedOrigins = config.allowedOrigins ?? getAllowedOriginsFromEnv();
  const allowNoOrigin = config.allowNoOrigin ?? true;
  const originHeader = req.headers.get("origin");
  const requestedHeaders = req.headers.get("Access-Control-Request-Headers");
  const matchedOrigin =
    originHeader && isOriginAllowed(originHeader, allowedOrigins)
      ? originHeader
      : null;

  if (originHeader && !matchedOrigin) {
    const corsHeaders = buildCorsHeaders(null, config, requestedHeaders);
    return {
      corsHeaders,
      origin: null,
      errorResponse: new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  if (!originHeader && !allowNoOrigin) {
    const corsHeaders = buildCorsHeaders(null, config, requestedHeaders);
    return {
      corsHeaders,
      origin: null,
      errorResponse: new Response(JSON.stringify({ error: "Origin required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  return {
    corsHeaders: buildCorsHeaders(matchedOrigin, config, requestedHeaders),
    origin: matchedOrigin,
  };
}

export function buildRedirectUrl(
  req: Request,
  path: string,
  allowedOrigins?: string[],
): string | undefined {
  const origins = allowedOrigins ?? getAllowedOriginsFromEnv();
  const originHeader = req.headers.get("origin");
  const matchedOrigin =
    originHeader && isOriginAllowed(originHeader, origins) ? originHeader : null;
  const fallbackOrigin = origins[0] ?? null;
  const origin = matchedOrigin ?? fallbackOrigin;

  return origin ? `${origin}${path}` : undefined;
}
