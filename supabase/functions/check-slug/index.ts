import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getAllowedOriginsFromEnv } from "../_shared/cors.ts";
import { verifyCaptcha } from "../_shared/captcha.ts";
import { initSentry } from "../_shared/sentry.ts";
import { logError, logInfo } from "../_shared/logger.ts";
import { createRequestId, getClientIp } from "../_shared/request.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const allowedOrigins = getAllowedOriginsFromEnv();

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SUFFIXES = ["clinic", "health", "med", "care", "plus"];

// --- Durable rate limiter (DB-backed) ---
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute
const RATE_LIMIT_MAX = 10; // max requests per IP per window

async function findAvailableSlugs(
  client: ReturnType<typeof createClient>,
  baseSlug: string,
): Promise<string[]> {
  const candidates: string[] = [];
  for (const suffix of SUFFIXES) {
    candidates.push(`${baseSlug}-${suffix}`);
  }
  for (let i = 2; i <= 4; i++) {
    candidates.push(`${baseSlug}-${i}`);
  }

  const { data } = await client.rpc("filter_available_tenant_slugs", { _slugs: candidates });
  const available = Array.isArray(data) ? (data as string[]) : [];
  return available.slice(0, 4);
}

Deno.serve(async (req) => {
  initSentry();
  const { corsHeaders, errorResponse } = enforceCors(req, {
    allowedOrigins,
  });
  const requestId = createRequestId(req);
  const clientIp = getClientIp(req);
  const baseHeaders = { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId };

  if (errorResponse) {
    return errorResponse;
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: baseHeaders,
    });
  }

  // Rate limit by client IP
  logInfo("check_slug_request", {
    request_id: requestId,
    action_type: "check_slug",
    resource_type: "tenant",
    metadata: { client_ip: clientIp },
  });

  try {
    const client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    );

    const rateLimit = await checkRateLimit({
      client,
      key: `check-slug:${clientIp}`,
      maxHits: RATE_LIMIT_MAX,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
      requestId,
      actionType: "check_slug",
      resourceType: "tenant",
      failOpen: true,
    });

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        {
          status: 429,
          headers: {
            ...baseHeaders,
            "Retry-After": String(rateLimit.retryAfter ?? 10),
          },
        },
      );
    }

    const body = await req.json();
    const clinicName = body.clinicName;
    const customSlug = body.customSlug; // optional: user-provided custom slug
    const captchaToken = body.captchaToken;

    const captchaResult = await verifyCaptcha(captchaToken, clientIp);
    if (!captchaResult.ok) {
      return new Response(JSON.stringify({ error: captchaResult.error ?? "Captcha verification failed" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    const slugToCheck = customSlug
      ? slugify(String(customSlug).trim())
      : clinicName
        ? slugify(String(clinicName).trim())
        : "";

    if (!slugToCheck || slugToCheck.length < 2 || slugToCheck.length > 60) {
      return new Response(
        JSON.stringify({
          available: false,
          slug: "",
          error: "Clinic name produces an invalid URL. Use letters or numbers.",
        }),
        { status: 200, headers: baseHeaders },
      );
    }

    if (
      !customSlug &&
      (!clinicName || typeof clinicName !== "string" || clinicName.trim().length < 2)
    ) {
      return new Response(
        JSON.stringify({ error: "Clinic name must be at least 2 characters" }),
        { status: 400, headers: baseHeaders },
      );
    }

    const { data: isAvailable, error: availError } = await client.rpc(
      "is_tenant_slug_available",
      { _slug: slugToCheck },
    );

    if (availError) {
      throw availError;
    }

    if (!isAvailable) {
      // Slug is taken — generate suggestions
      const baseSlug = customSlug ? slugToCheck : slugify(String(clinicName).trim());
      const suggestions = await findAvailableSlugs(client, baseSlug);
      return new Response(
        JSON.stringify({ available: false, slug: slugToCheck, suggestions }),
        { status: 200, headers: baseHeaders },
      );
    }

    return new Response(
      JSON.stringify({ available: true, slug: slugToCheck, suggestions: [] }),
      { status: 200, headers: baseHeaders },
    );
  } catch (err) {
    logError("check_slug_failed", {
      request_id: requestId,
      action_type: "check_slug",
      resource_type: "tenant",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: baseHeaders },
    );
  }
});

