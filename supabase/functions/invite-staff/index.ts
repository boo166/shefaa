import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildRedirectUrl,
  enforceCors,
  getAllowedOriginsFromEnv,
} from "../_shared/cors.ts";

const allowedOrigins = getAllowedOriginsFromEnv();

// --- Durable rate limiter (DB-backed) ---
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 10;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: allowed, error: rateError } = await adminClient.rpc(
      "check_rate_limit",
      {
        _key: `invite-staff:${clientIp}`,
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
            "Retry-After": "15",
          },
        },
      );
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await callerClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = claimsData.claims.sub;

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .single();

    if (!roleData || roleData.role !== "clinic_admin") {
      return new Response(
        JSON.stringify({ error: "Only clinic admins can invite staff" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("user_id", callerId)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Caller profile not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, full_name, role } = await req.json();
    if (!email || !full_name || !role) {
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

    const normalizedName = String(full_name).trim();
    if (normalizedName.length < 2 || normalizedName.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid full name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validRoles = [
      "clinic_admin",
      "doctor",
      "receptionist",
      "nurse",
      "accountant",
    ];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const inviteCode = crypto.randomUUID();

    const { error: inviteErr } = await adminClient.from("user_invites").insert({
      tenant_id: callerProfile.tenant_id,
      email: normalizedEmail,
      role,
      invite_code: inviteCode,
      invited_by_user_id: callerId,
    });

    if (inviteErr) {
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectTo = buildRedirectUrl(req, "/login", allowedOrigins);

    const { data: inviteUserData, error: createErr } =
      await adminClient.auth.admin.inviteUserByEmail(normalizedEmail, {
        data: {
          full_name: normalizedName,
          tenant_id: callerProfile.tenant_id,
          invite_code: inviteCode,
        },
        redirectTo,
      });

    if (createErr) {
      await adminClient
        .from("user_invites")
        .delete()
        .eq("tenant_id", callerProfile.tenant_id)
        .eq("email", normalizedEmail)
        .eq("invite_code", inviteCode)
        .is("consumed_at", null);

      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await adminClient.rpc("log_audit_event", {
      _tenant_id: callerProfile.tenant_id,
      _user_id: callerId,
      _action: "staff_invited",
      _entity_type: "user_invite",
      _entity_id: inviteUserData.user?.id ?? null,
      _details: { email: normalizedEmail, role, invited_by: callerId },
    });

    return new Response(
      JSON.stringify({ success: true, user_id: inviteUserData.user?.id }),
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
