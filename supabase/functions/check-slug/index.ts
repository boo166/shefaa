import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getAllowedOriginsFromEnv } from "../_shared/cors.ts";

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
const RATE_LIMIT_MAX = 20; // max requests per IP per window

async function findAvailableSlugs(
  adminClient: ReturnType<typeof createClient>,
  baseSlug: string,
): Promise<string[]> {
  const candidates: string[] = [];
  for (const suffix of SUFFIXES) {
    candidates.push(`${baseSlug}-${suffix}`);
  }
  for (let i = 2; i <= 4; i++) {
    candidates.push(`${baseSlug}-${i}`);
  }

  const { data: existing } = await adminClient
    .from("tenants")
    .select("slug")
    .in("slug", candidates);

  const takenSet = new Set((existing ?? []).map((r: { slug: string }) => r.slug));
  return candidates.filter((c) => !takenSet.has(c)).slice(0, 4);
}

Deno.serve(async (req) => {
  const { corsHeaders, errorResponse } = enforceCors(req, {
    allowedOrigins,
  });

  if (errorResponse) {
    return errorResponse;
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit by client IP
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    "unknown";

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: allowed, error: rateError } = await adminClient.rpc(
      "check_rate_limit",
      {
        _key: `check-slug:${clientIp}`,
        _max_hits: RATE_LIMIT_MAX,
        _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    );

    if (rateError) {
      return new Response(JSON.stringify({ error: "Rate limiter unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please slow down." }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "10",
          },
        },
      );
    }

    const body = await req.json();
    const clinicName = body.clinicName;
    const customSlug = body.customSlug; // optional: user-provided custom slug

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
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (
      !customSlug &&
      (!clinicName || typeof clinicName !== "string" || clinicName.trim().length < 2)
    ) {
      return new Response(
        JSON.stringify({ error: "Clinic name must be at least 2 characters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data } = await adminClient
      .from("tenants")
      .select("id")
      .eq("slug", slugToCheck)
      .maybeSingle();

    if (data) {
      // Slug is taken — generate suggestions
      const baseSlug = customSlug ? slugToCheck : slugify(String(clinicName).trim());
      const suggestions = await findAvailableSlugs(adminClient, baseSlug);
      return new Response(
        JSON.stringify({ available: false, slug: slugToCheck, suggestions }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ available: true, slug: slugToCheck, suggestions: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
