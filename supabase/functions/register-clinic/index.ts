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

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

// --- In-memory sliding-window rate limiter ---
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5; // stricter for signup

const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = ipHits.get(ip) ?? [];
  const recent = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, hits] of ipHits) {
    const recent = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (recent.length === 0) ipHits.delete(ip);
    else ipHits.set(ip, recent);
  }
}, 5 * 60_000);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ?? "unknown";

  if (isRateLimited(clientIp)) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" } },
    );
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { clinicName, fullName, email, password, slug: requestedSlug } = await req.json();
    if (!clinicName || !fullName || !email || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const slugInput = requestedSlug ? String(requestedSlug).trim() : String(clinicName);
    const slug = slugify(slugInput);
    if (!slug || !isValidSlug(slug)) {
      return new Response(JSON.stringify({ error: "Invalid clinic URL slug" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant, error: tenantErr } = await adminClient
      .from("tenants")
      .insert({ name: clinicName, slug, pending_owner_email: normalizedEmail })
      .select("id")
      .single();

    if (tenantErr || !tenant?.id) {
      let errorMessage = "Failed to create clinic";
      
      // Check for duplicate slug constraint violation
      if (tenantErr?.message?.includes("slug") || tenantErr?.code === "23505") {
        errorMessage = "A clinic with this name already exists. Please choose a different name.";
      }
      
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: subErr } = await adminClient
      .from("subscriptions")
      .upsert(
        {
          tenant_id: tenant.id,
          plan: "free",
          status: "active",
          amount: 0,
          currency: "EGP",
          billing_cycle: "monthly",
        },
        { onConflict: "tenant_id", ignoreDuplicates: true },
      );

    if (subErr) {
      await adminClient.from("tenants").delete().eq("id", tenant.id);
      return new Response(JSON.stringify({ error: "Failed to initialize subscription" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: createErr } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: false,
      user_metadata: {
        full_name: fullName,
        tenant_id: tenant.id,
      },
    });

    if (createErr) {
      await adminClient.from("tenants").delete().eq("id", tenant.id);
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await adminClient.rpc("log_audit_event", {
      _tenant_id: tenant.id,
      _user_id: "00000000-0000-0000-0000-000000000000",
      _action: "clinic_created",
      _entity_type: "tenant",
      _entity_id: tenant.id,
      _details: { clinic_name: clinicName, owner_email: normalizedEmail },
    });

    return new Response(JSON.stringify({ success: true, tenant_id: tenant.id, slug }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
