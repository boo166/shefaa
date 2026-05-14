import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceCors, getAllowedOriginsFromEnv, buildRedirectUrl } from "../_shared/cors.ts";
import { verifyCaptcha } from "../_shared/captcha.ts";
import { initSentry } from "../_shared/sentry.ts";
import { logError, logInfo } from "../_shared/logger.ts";
import { createRequestId, getClientIp } from "../_shared/request.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";

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
const RATE_LIMIT_MAX = 3; // stricter for signup
const EMAIL_RATE_LIMIT_WINDOW_SECONDS = 60 * 60; // 1 hour
const EMAIL_RATE_LIMIT_MAX = 2;

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
  logInfo("register_clinic_request", {
    request_id: requestId,
    action_type: "register_clinic",
    resource_type: "tenant",
    metadata: { client_ip: clientIp },
  });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const client = createClient(supabaseUrl, anonKey);

    const rateLimit = await checkRateLimit({
      client,
      key: `register-clinic:${clientIp}`,
      maxHits: RATE_LIMIT_MAX,
      windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
      requestId,
      actionType: "register_clinic",
      resourceType: "tenant",
      failOpen: true,
    });

    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            ...baseHeaders,
            "Retry-After": String(rateLimit.retryAfter ?? 30),
          },
        },
      );
    }

    const {
      clinicName,
      fullName,
      email,
      password,
      slug: requestedSlug,
      captchaToken,
    } = await req.json();
    if (!clinicName || !fullName || !email || !password) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    const captchaResult = await verifyCaptcha(captchaToken, clientIp);
    if (!captchaResult.ok) {
      return new Response(JSON.stringify({ error: captchaResult.error ?? "Captcha verification failed" }), {
        status: 400,
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

    const emailRateLimit = await checkRateLimit({
      client,
      key: `register-clinic-email:${normalizedEmail}`,
      maxHits: EMAIL_RATE_LIMIT_MAX,
      windowSeconds: EMAIL_RATE_LIMIT_WINDOW_SECONDS,
      requestId,
      actionType: "register_clinic_email",
      resourceType: "tenant",
      failOpen: true,
    });

    if (!emailRateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many requests for this email. Please try again later." }),
        {
          status: 429,
          headers: {
            ...baseHeaders,
            "Retry-After": String(emailRateLimit.retryAfter ?? 3600),
          },
        },
      );
    }

    const normalizedFullName = String(fullName).trim();
    if (normalizedFullName.length < 2 || normalizedFullName.length > 100) {
      return new Response(JSON.stringify({ error: "Invalid full name" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    const normalizedClinicName = String(clinicName).trim();
    if (normalizedClinicName.length < 2 || normalizedClinicName.length > 120) {
      return new Response(JSON.stringify({ error: "Invalid clinic name" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    const passwordStr = String(password);
    if (passwordStr.length < 8 || passwordStr.length > 128) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    const slugInput = requestedSlug
      ? String(requestedSlug).trim()
      : normalizedClinicName;
    const slug = slugify(slugInput);
    if (!slug || !isValidSlug(slug) || slug.length < 2 || slug.length > 60) {
      return new Response(JSON.stringify({ error: "Invalid clinic URL slug" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    const { data: isAvailable, error: availError } = await client.rpc(
      "is_tenant_slug_available",
      { _slug: slug },
    );

    if (availError) {
      throw availError;
    }

    if (!isAvailable) {
      return new Response(
        JSON.stringify({ error: "A clinic with this name already exists. Please choose a different name." }),
        { status: 400, headers: baseHeaders },
      );
    }

    const { data: tenantId, error: tenantErr } = await client.rpc(
      "create_tenant_for_signup",
      { _name: normalizedClinicName, _slug: slug, _owner_email: normalizedEmail },
    );

    if (tenantErr || !tenantId) {
      return new Response(JSON.stringify({ error: tenantErr?.message ?? "Failed to create clinic" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    const redirectTo = buildRedirectUrl(req, "/login", allowedOrigins);

    const { data: signUpData, error: signUpErr } = await client.auth.signUp({
      email: normalizedEmail,
      password: passwordStr,
      options: {
        data: {
          full_name: normalizedFullName,
          tenant_id: tenantId,
        },
        emailRedirectTo: redirectTo,
      },
    });

    if (signUpErr) {
      await client.rpc("cancel_tenant_signup", {
        _tenant_id: tenantId,
        _owner_email: normalizedEmail,
      });
      return new Response(JSON.stringify({ error: signUpErr.message ?? "Failed to create user" }), {
        status: 400,
        headers: baseHeaders,
      });
    }

    // Best-effort audit log
    await client.rpc("log_audit_event", {
      _tenant_id: tenantId,
      _user_id: signUpData.user?.id ?? "00000000-0000-0000-0000-000000000000",
      _action: "clinic_created",
      _entity_type: "tenant",
      _entity_id: tenantId,
      _details: { clinic_name: normalizedClinicName, owner_email: normalizedEmail },
    }).catch(() => undefined);

    return new Response(
      JSON.stringify({ success: true, tenant_id: tenantId, slug }),
      {
        status: 200,
        headers: baseHeaders,
      },
    );
  } catch (err) {
    logError("register_clinic_failed", {
      request_id: requestId,
      action_type: "register_clinic",
      resource_type: "tenant",
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
