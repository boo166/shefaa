import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const SUFFIXES = ["clinic", "health", "med", "care", "plus"];

async function findAvailableSlugs(
  adminClient: ReturnType<typeof createClient>,
  baseSlug: string,
): Promise<string[]> {
  // Generate candidates: base-2, base-3, base-clinic, base-health, etc.
  const candidates: string[] = [];
  for (const suffix of SUFFIXES) {
    candidates.push(`${baseSlug}-${suffix}`);
  }
  for (let i = 2; i <= 4; i++) {
    candidates.push(`${baseSlug}-${i}`);
  }

  // Batch check all candidates
  const { data: existing } = await adminClient
    .from("tenants")
    .select("slug")
    .in("slug", candidates);

  const takenSet = new Set((existing ?? []).map((r: { slug: string }) => r.slug));
  return candidates.filter((c) => !takenSet.has(c)).slice(0, 4);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const clinicName = body.clinicName;
    const customSlug = body.customSlug; // optional: user-provided custom slug

    const slugToCheck = customSlug
      ? slugify(String(customSlug).trim())
      : clinicName
        ? slugify(String(clinicName).trim())
        : "";

    if (!slugToCheck) {
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
