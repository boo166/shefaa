export type CorsConfig = {
  allowedOrigins?: string[];
  allowedHeaders?: string[];
  allowedMethods?: string[];
  allowNoOrigin?: boolean;
};

const DEFAULT_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

const DEFAULT_ALLOWED_METHODS = ["GET", "POST", "OPTIONS"];

export function getAllowedOriginsFromEnv(): string[] {
  const raw = Deno.env.get("APP_ORIGINS") ?? Deno.env.get("APP_ORIGIN") ?? "";
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function buildCorsHeaders(origin: string | null, config: CorsConfig = {}): HeadersInit {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": config.allowedHeaders ?? DEFAULT_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": (config.allowedMethods ?? DEFAULT_ALLOWED_METHODS).join(","),
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
  const matchedOrigin =
    originHeader && allowedOrigins.includes(originHeader) ? originHeader : null;

  if (originHeader && !matchedOrigin) {
    const corsHeaders = buildCorsHeaders(null, config);
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
    const corsHeaders = buildCorsHeaders(null, config);
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
    corsHeaders: buildCorsHeaders(matchedOrigin, config),
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
    originHeader && origins.includes(originHeader) ? originHeader : null;
  const fallbackOrigin = origins[0] ?? null;
  const origin = matchedOrigin ?? fallbackOrigin;

  return origin ? `${origin}${path}` : undefined;
}
