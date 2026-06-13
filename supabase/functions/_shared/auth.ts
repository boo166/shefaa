import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ResolvedBearerAuth = {
  userId: string;
  sessionId: string | null;
  aal: string | null;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(normalized);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function collectAuthApiKeys(): string[] {
  const keys = new Set<string>();
  const legacyAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const publishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (legacyAnon) keys.add(legacyAnon);
  if (publishable) keys.add(publishable);

  const publishableKeysJson = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishableKeysJson) {
    try {
      const parsed = JSON.parse(publishableKeysJson) as Record<string, string>;
      Object.values(parsed).forEach((value) => {
        if (typeof value === "string" && value.trim()) keys.add(value);
      });
    } catch {
      /* ignore malformed env */
    }
  }

  return Array.from(keys);
}

function authFromPayload(payload: Record<string, unknown> | null, userId?: string): ResolvedBearerAuth | null {
  const sub = userId ?? (typeof payload?.sub === "string" ? payload.sub : null);
  if (!sub) return null;
  return {
    userId: sub,
    sessionId: typeof payload?.session_id === "string" ? payload.session_id : null,
    aal: typeof payload?.aal === "string" ? payload.aal : null,
  };
}

async function verifyUserJwtViaAuthApi(
  authHeader: string,
  token: string,
): Promise<ResolvedBearerAuth | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const apiKeys = collectAuthApiKeys();
  if (apiKeys.length === 0) return null;

  for (const apikey of apiKeys) {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey,
      },
    });
    if (!response.ok) continue;

    const body = await response.json().catch(() => null) as { id?: string } | null;
    const payload = decodeJwtPayload(token);
    const auth = authFromPayload(payload, body?.id);
    if (auth) return auth;
  }

  return null;
}

export async function resolveBearerAuth(authHeader: string | null): Promise<
  | { auth: ResolvedBearerAuth; callerClient: ReturnType<typeof createClient> }
  | { error: Response }
> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const apiKeys = collectAuthApiKeys();
  const anonKey = apiKeys[0];
  if (!anonKey) {
    return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await callerClient.auth.getClaims(token);

  if (!claimsError && claimsData?.claims?.sub) {
    return {
      auth: {
        userId: String(claimsData.claims.sub),
        sessionId: typeof claimsData.claims.session_id === "string" ? claimsData.claims.session_id : null,
        aal: typeof claimsData.claims.aal === "string" ? claimsData.claims.aal : null,
      },
      callerClient,
    };
  }

  const { data: userData, error: userError } = await callerClient.auth.getUser(token);
  if (!userError && userData.user?.id) {
    const payload = decodeJwtPayload(token);
    const auth = authFromPayload(payload, userData.user.id);
    if (auth) {
      return { auth, callerClient };
    }
  }

  const verified = await verifyUserJwtViaAuthApi(authHeader, token);
  if (verified) {
    return { auth: verified, callerClient };
  }

  return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
}

export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const resolved = await resolveBearerAuth(authHeader);
  if ("error" in resolved) {
    return { error: resolved.error };
  }

  const userId = resolved.auth.userId;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

  const { data: globalRoleData } = await adminClient
    .from("user_global_roles")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null)
    ;

  const { data: tenantRoleData } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    ;

  const globalRoles = (globalRoleData ?? []).map((entry) => entry.role);
  const tenantRoles = (tenantRoleData ?? []).map((entry) => entry.role);
  const isSuperAdmin = globalRoles.includes("super_admin");
  const isClinicAdmin = tenantRoles.includes("clinic_admin");

  if (!isSuperAdmin && !isClinicAdmin) {
    return { error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) };
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (isSuperAdmin) {
    return { adminClient, userId, tenantId: null };
  }

  if (!profile?.tenant_id) {
    return { error: new Response(JSON.stringify({ error: "Tenant not found" }), { status: 400 }) };
  }

  return { adminClient, userId, tenantId: profile.tenant_id };
}
