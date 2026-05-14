import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildRedirectUrl,
  enforceCors,
  getAllowedOriginsFromEnv,
} from "../_shared/cors.ts";
import { initSentry } from "../_shared/sentry.ts";
import { logError, logInfo } from "../_shared/logger.ts";
import { createRequestId, getClientIp } from "../_shared/request.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

const allowedOrigins = getAllowedOriginsFromEnv();

// --- Durable rate limiter (DB-backed) ---
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX = 10;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  initSentry();
  const { corsHeaders, errorResponse } = enforceCors(req, {
    allowedOrigins,
  });
  const requestId = createRequestId(req);
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

  const clientIp = getClientIp(req);
  logInfo("invite_staff_request", {
    request_id: requestId,
    action_type: "invite_staff",
    resource_type: "user_invite",
    metadata: { client_ip: clientIp },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: baseHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ??
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const rateLimit = await checkRateLimit({
      client: adminClient,
      key: `invite-staff:${clientIp}`,
      maxHits: RATE_LIMIT_MAX,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
      requestId,
      actionType: "invite_staff",
      resourceType: "user_invite",
      failOpen: true,
    });

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            ...baseHeaders,
            "Retry-After": String(rateLimit.retryAfter ?? 15),
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
        headers: baseHeaders,
      });
    }

    const callerId = claimsData.claims.sub;
    const callerSessionId = claimsData.claims.session_id;
    const callerAal = claimsData.claims.aal;

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
          headers: baseHeaders,
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
        headers: baseHeaders,
      });
    }

    const { email, full_name, role, stepUpGrantId } = await req.json();
    if (!email || !full_name || !role || !stepUpGrantId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    if (callerAal !== "aal2") {
      return new Response(JSON.stringify({ error: "Clinic admin MFA is required for this action" }), {
        status: 403,
        headers: baseHeaders,
      });
    }

    const { error: stepUpError } = await adminClient.rpc(
      "consume_privileged_step_up_grant_for_actor",
      {
        _actor_id: callerId,
        _session_id: callerSessionId ?? null,
        _grant_id: stepUpGrantId,
        _role_tier: "clinic_admin",
        _action_key: "staff_invite",
        _tenant_id: callerProfile.tenant_id,
        _resource_id: null,
      },
    );

    if (stepUpError) {
      return new Response(JSON.stringify({ error: stepUpError.message ?? "Valid privileged step-up grant required for this action" }), {
        status: 403,
        headers: baseHeaders,
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    const normalizedName = String(full_name).trim();
    if (normalizedName.length < 2 || normalizedName.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid full name" }), {
        status: 400,
        headers: baseHeaders,
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
        headers: baseHeaders,
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
      logError("invite_staff_failed", {
        request_id: requestId,
        tenant_id: callerProfile.tenant_id,
        user_id: callerId,
        action_type: "invite_staff",
        resource_type: "user_invite",
        metadata: { error: inviteErr.message },
      });
      return new Response(JSON.stringify({ error: inviteErr.message }), {
        status: 400,
        headers: baseHeaders,
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

      logError("invite_staff_create_user_failed", {
        request_id: requestId,
        tenant_id: callerProfile.tenant_id,
        user_id: callerId,
        action_type: "invite_staff",
        resource_type: "user_invite",
        metadata: { error: createErr.message },
      });
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    // Audit log
    await adminClient.rpc("log_audit_event", {
      _tenant_id: callerProfile.tenant_id,
      _user_id: callerId,
      _action: "staff_invited",
      _entity_type: "user_invite",
      _entity_id: inviteUserData.user?.id ?? null,
      _details: {
        email: normalizedEmail,
        role,
        invited_by: callerId,
        role_tier: "clinic_admin",
        request_id: requestId,
      },
      _request_id: requestId,
      _action_type: "staff_invite",
      _resource_type: "user_invite",
    });

    return new Response(
      JSON.stringify({ success: true, user_id: inviteUserData.user?.id }),
      {
        status: 200,
        headers: baseHeaders,
      },
    );
  } catch (err) {
    logError("invite_staff_unhandled", {
      request_id: requestId,
      action_type: "invite_staff",
      resource_type: "user_invite",
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: baseHeaders },
    );
  }
});
