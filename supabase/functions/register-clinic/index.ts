import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getAllowedOriginsFromEnv } from "../_shared/cors.ts";

const allowedOrigins = getAllowedOriginsFromEnv();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isValidSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

// --- Durable rate limiter (DB-backed) ---
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 5; // stricter for signup

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

  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ?? "unknown";

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: allowed, error: rateError } = await adminClient.rpc(
      "check_rate_limit",
      {
        _key: `register-clinic:${clientIp}`,
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
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "30",
          },
        },
      );
    }

    const { clinicName, fullName, email, password, slug: requestedSlug } =
      await req.json();
    if (!clinicName || !fullName || !email || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedFullName = String(fullName).trim();
    if (normalizedFullName.length < 2 || normalizedFullName.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid full name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedClinicName = String(clinicName).trim();
    if (normalizedClinicName.length < 2 || normalizedClinicName.length > 120) {
      return new Response(JSON.stringify({ error: "Invalid clinic name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const passwordStr = String(password);
    if (passwordStr.length < 8 || passwordStr.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const slugInput = requestedSlug
      ? String(requestedSlug).trim()
      : normalizedClinicName;
    const slug = slugify(slugInput);
    if (!slug || !isValidSlug(slug) || slug.length < 2 || slug.length > 60) {
      return new Response(JSON.stringify({ error: "Invalid clinic URL slug" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant, error: tenantErr } = await adminClient
      .from("tenants")
      .insert({ name: normalizedClinicName, slug, pending_owner_email: normalizedEmail })
      .select("id")
      .single();

    if (tenantErr || !tenant?.id) {
      let errorMessage = "Failed to create clinic";

      // Check for duplicate slug constraint violation
      if (tenantErr?.message?.includes("slug") || tenantErr?.code === "23505") {
        errorMessage =
          "A clinic with this name already exists. Please choose a different name.";
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: subErr } = await adminClient.from("subscriptions").upsert(
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
      return new Response(
        JSON.stringify({ error: "Failed to initialize subscription" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: createErr } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: passwordStr,
      email_confirm: false,
      user_metadata: {
        full_name: normalizedFullName,
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
      _details: { clinic_name: normalizedClinicName, owner_email: normalizedEmail },
    });

    return new Response(
      JSON.stringify({ success: true, tenant_id: tenant.id, slug }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
