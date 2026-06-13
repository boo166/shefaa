import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

import { loadLocalEnv } from "./lib/env.mjs";
import { resolveSupabaseTarget } from "./lib/supabase-target.mjs";

const projectRoot = process.cwd();
loadLocalEnv(projectRoot, [".env", ".env.local"]);

const DEFAULT_PASSWORD = "MedFlowE2E!2026";
const DEFAULT_EMAIL_DOMAIN = process.env.E2E_EMAIL_DOMAIN?.trim() || "example.com";

function readProjectRef() {
  if (process.env.VITE_SUPABASE_PROJECT_ID) {
    return process.env.VITE_SUPABASE_PROJECT_ID.replace(/"/g, "").trim();
  }

  const tempProjectRefPath = path.join(projectRoot, "supabase", ".temp", "project-ref");
  if (fs.existsSync(tempProjectRefPath)) {
    return fs.readFileSync(tempProjectRefPath, "utf8").trim();
  }

  const supabaseUrl = resolveSupabaseUrl();
  return new URL(supabaseUrl).hostname.split(".")[0];
}

function resolveSupabaseUrl() {
  const value = process.env.E2E_SUPABASE_URL
    ?? process.env.VITE_SUPABASE_URL
    ?? process.env.SUPABASE_URL;

  if (!value) {
    throw new Error("Missing Supabase URL. Set E2E_SUPABASE_URL, VITE_SUPABASE_URL, or SUPABASE_URL.");
  }

  return value.replace(/"/g, "").trim();
}

function resolvePublishableKey() {
  const value = process.env.E2E_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.SUPABASE_PUBLISHABLE_KEY
    ?? process.env.SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error(
      "Missing Supabase publishable key. Set E2E_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_PUBLISHABLE_KEY, or SUPABASE_ANON_KEY.",
    );
  }

  return value.replace(/"/g, "").trim();
}

function fetchServiceRoleKey(projectRef) {
  const localTarget = resolveSupabaseTarget(projectRoot);
  if (localTarget.serviceRoleKey) {
    return localTarget.serviceRoleKey.trim();
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }

  const output = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", projectRef, "--output", "json"],
    { cwd: projectRoot, encoding: "utf8" },
  );

  const keys = JSON.parse(output);
  if (!Array.isArray(keys)) {
    throw new Error("Unexpected response from `supabase projects api-keys`.");
  }

  const key = keys.find((entry) => entry?.name === "service_role")
    ?? keys.find((entry) => entry?.type === "secret" && entry?.secret_jwt_template?.role === "service_role");

  if (!key?.api_key) {
    throw new Error("Could not resolve the service role key from the linked Supabase project.");
  }

  return key.api_key;
}

function deterministicIdentity(prefix, projectRef) {
  const suffix = projectRef.slice(0, 6).toLowerCase();
  return {
    email: `${prefix}.${suffix}@${DEFAULT_EMAIL_DOMAIN}`,
    suffix,
  };
}

async function getUserByEmail(adminClient, email) {
  const target = email.toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data?.users?.find((candidate) => String(candidate?.email ?? "").toLowerCase() === target);
    if (user) return user;
    if (!data?.users?.length || data.users.length < perPage) return null;
  }

  throw new Error("Auth user search exceeded paging limits.");
}

async function ensureTenant(adminClient, input) {
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await adminClient
    .from("tenants")
    .select("id, slug")
    .eq("slug", input.slug)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error: updateError } = await adminClient
      .from("tenants")
      .update({
        name: input.name,
        email: input.email,
        phone: null,
        address: null,
        status: "active",
        status_reason: null,
        status_changed_at: now,
      })
      .eq("id", existing.id);

    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: created, error: createError } = await adminClient
    .from("tenants")
    .insert({
      name: input.name,
      slug: input.slug,
      email: input.email,
      phone: null,
      address: null,
      pending_owner_email: null,
      status: "active",
      status_reason: null,
      status_changed_at: now,
    })
    .select("id")
    .single();

  if (createError || !created?.id) {
    throw createError ?? new Error(`Failed to create tenant ${input.slug}`);
  }

  return created.id;
}

async function ensurePricingPlanSubscription(adminClient, tenantId, planCode = "starter", billingCycle = "monthly") {
  const { data: plan, error: planError } = await adminClient
    .from("pricing_plans")
    .select("plan_code, monthly_price, annual_price, currency")
    .eq("plan_code", planCode)
    .is("deleted_at", null)
    .single();

  if (planError || !plan) {
    throw planError ?? new Error(`Pricing plan ${planCode} not found`);
  }

  const amount = Number(billingCycle === "annual" ? plan.annual_price : plan.monthly_price);

  const { error: subscriptionError } = await adminClient
    .from("subscriptions")
    .upsert(
      {
        tenant_id: tenantId,
        plan: plan.plan_code,
        status: "active",
        amount,
        currency: plan.currency,
        billing_cycle: billingCycle,
        started_at: new Date().toISOString(),
        expires_at: null,
      },
      { onConflict: "tenant_id" },
    );

  if (subscriptionError) throw subscriptionError;
}

async function ensureAuthUser(adminClient, input) {
  let user = await getUserByEmail(adminClient, input.email);

  if (!user) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: input.userMetadata,
    });

    if (error || !data?.user) {
      throw error ?? new Error(`Failed to create auth user for ${input.email}`);
    }

    return data.user;
  }

  const mergedMetadata = {
    ...(user.user_metadata ?? {}),
    ...input.userMetadata,
  };

  const { data, error } = await adminClient.auth.admin.updateUserById(user.id, {
    password: input.password,
    email_confirm: true,
    user_metadata: mergedMetadata,
  });

  if (error || !data?.user) {
    throw error ?? new Error(`Failed to update auth user for ${input.email}`);
  }

  return data.user;
}

async function ensureProfileAndRole(adminClient, input) {
  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert(
      {
        user_id: input.userId,
        tenant_id: input.tenantId,
        full_name: input.fullName,
      },
      { onConflict: "user_id" },
    );

  if (profileError) throw profileError;

  const { error: roleError } = await adminClient
    .from("user_roles")
    .upsert(
      {
        user_id: input.userId,
        role: input.role,
      },
      { onConflict: "user_id" },
    );

  if (roleError) throw roleError;
}

async function ensureGlobalSuperAdmin(adminClient, input) {
  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert(
      {
        user_id: input.userId,
        tenant_id: null,
        full_name: input.fullName,
      },
      { onConflict: "user_id" },
    );

  if (profileError) throw profileError;

  const { error: deleteRoleError } = await adminClient
    .from("user_roles")
    .delete()
    .eq("user_id", input.userId)
    .eq("role", "super_admin");

  if (deleteRoleError) throw deleteRoleError;

  const { error: globalRoleError } = await adminClient
    .from("user_global_roles")
    .upsert(
      {
        user_id: input.userId,
        role: "super_admin",
        granted_by: null,
        is_break_glass: false,
        break_glass_reason: null,
        requires_mfa: true,
      },
      { onConflict: "user_id,role" },
    );

  if (globalRoleError) throw globalRoleError;
}

async function ensureTenantOwner(adminClient, input) {
  const { error: updateTenantError } = await adminClient
    .from("tenants")
    .update({ pending_owner_email: input.email })
    .eq("id", input.tenantId);

  if (updateTenantError) throw updateTenantError;

  const user = await ensureAuthUser(adminClient, {
    email: input.email,
    password: input.password,
    userMetadata: {
      full_name: input.fullName,
      tenant_id: input.tenantId,
    },
  });

  await ensureProfileAndRole(adminClient, {
    userId: user.id,
    tenantId: input.tenantId,
    fullName: input.fullName,
    role: "clinic_admin",
  });

  const { error: clearPendingError } = await adminClient
    .from("tenants")
    .update({ pending_owner_email: null })
    .eq("id", input.tenantId);

  if (clearPendingError) throw clearPendingError;

  return user;
}

async function ensureSuperAdmin(adminClient, input) {
  const user = await ensureAuthUser(adminClient, {
    email: input.email,
    password: input.password,
    userMetadata: {
      full_name: input.fullName,
      tenant_id: null,
    },
  });

  await ensureGlobalSuperAdmin(adminClient, {
    userId: user.id,
    fullName: input.fullName,
  });

  return user;
}

async function ensureDoctor(adminClient, input) {
  const { data: existing, error: existingError } = await adminClient
    .from("doctors")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("email", input.email)
    .maybeSingle();

  if (existingError) throw existingError;

  let doctorId = existing?.id;

  if (!doctorId) {
    const { data: created, error: createError } = await adminClient
      .from("doctors")
      .insert({
        tenant_id: input.tenantId,
        full_name: input.fullName,
        specialty: "general",
        email: input.email,
        status: "available",
      })
      .select("id")
      .single();

    if (createError || !created?.id) {
      throw createError ?? new Error("Failed to create E2E doctor");
    }

    doctorId = created.id;
  } else {
    const { error: updateError } = await adminClient
      .from("doctors")
      .update({
        full_name: input.fullName,
        specialty: "general",
        email: input.email,
        status: "available",
        deleted_at: null,
        deleted_by: null,
      })
      .eq("id", doctorId);

    if (updateError) throw updateError;
  }

  const scheduleRows = Array.from({ length: 7 }, (_, day) => ({
    tenant_id: input.tenantId,
    doctor_id: doctorId,
    day_of_week: day,
    start_time: "08:00:00",
    end_time: "18:00:00",
    is_active: true,
  }));

  const { error: scheduleError } = await adminClient
    .from("doctor_schedules")
    .upsert(scheduleRows, { onConflict: "doctor_id,day_of_week,start_time" });

  if (scheduleError) throw scheduleError;

  return doctorId;
}

async function ensurePatient(adminClient, input) {
  const { data: existing, error: existingError } = await adminClient
    .from("patients")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("email", input.email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    const { error: updateError } = await adminClient
      .from("patients")
      .update({
        full_name: input.fullName,
        date_of_birth: input.dateOfBirth,
        gender: input.gender,
        status: "active",
        email: input.email,
      })
      .eq("id", existing.id);

    if (updateError) throw updateError;
    return existing.id;
  }

  const { data: created, error: createError } = await adminClient
    .from("patients")
    .insert({
      tenant_id: input.tenantId,
      full_name: input.fullName,
      date_of_birth: input.dateOfBirth,
      gender: input.gender,
      email: input.email,
      status: "active",
    })
    .select("id")
    .single();

  if (createError || !created?.id) {
    throw createError ?? new Error(`Failed to create patient ${input.fullName}`);
  }

  return created.id;
}

async function ensurePortalUser(adminClient, input) {
  const user = await ensureAuthUser(adminClient, {
    email: input.email,
    password: input.password,
    userMetadata: {
      portal: "true",
      tenant_id: input.tenantId,
      patient_id: input.patientId,
      full_name: input.fullName,
    },
  });

  const { error: accountError } = await adminClient
    .from("patient_accounts")
    .upsert(
      {
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        auth_user_id: user.id,
        status: "active",
        invited_at: new Date().toISOString(),
        activated_at: new Date().toISOString(),
      },
      { onConflict: "patient_id" },
    );

  if (accountError) throw accountError;

  const { error: patientError } = await adminClient
    .from("patients")
    .update({ user_id: user.id })
    .eq("id", input.patientId);

  if (patientError) throw patientError;

  return user;
}

async function ensurePortalAccountLink(adminClient, input) {
  const { data: existing, error: existingError } = await adminClient
    .from("patient_accounts")
    .select("id")
    .eq("patient_id", input.patientId)
    .maybeSingle();

  if (existingError) throw existingError;

  let accountError;
  if (existing?.id) {
    ({ error: accountError } = await adminClient
      .from("patient_accounts")
      .update({
        tenant_id: input.tenantId,
        auth_user_id: input.userId,
        status: input.status ?? "active",
        invited_at: new Date().toISOString(),
        activated_at: input.status === "invited" ? null : new Date().toISOString(),
      })
      .eq("id", existing.id));
  } else {
    ({ error: accountError } = await adminClient
      .from("patient_accounts")
      .insert({
        tenant_id: input.tenantId,
        patient_id: input.patientId,
        auth_user_id: input.userId,
        status: input.status ?? "active",
        invited_at: new Date().toISOString(),
        activated_at: input.status === "invited" ? null : new Date().toISOString(),
      }));
  }

  if (accountError) throw accountError;

  const { error: patientError } = await adminClient
    .from("patients")
    .update({ user_id: input.status === "invited" ? null : input.userId })
    .eq("id", input.patientId);

  if (patientError) throw patientError;
}

async function ensurePortalInvite(adminClient, input) {
  await ensurePortalAccountLink(adminClient, {
    tenantId: input.tenantId,
    patientId: input.patientId,
    userId: null,
    status: "invited",
  });
}

function writeEnvFile(filePath, envEntries) {
  const content = Object.entries(envEntries)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  fs.writeFileSync(filePath, `${content}\n`, "utf8");
}

async function main() {
  const target = resolveSupabaseTarget(projectRoot);
  const supabaseUrl = target.url ?? resolveSupabaseUrl();
  const publishableKey = target.publishableKey ?? resolvePublishableKey();
  const projectRef = readProjectRef();
  const serviceRoleKey = target.serviceRoleKey ?? fetchServiceRoleKey(projectRef);

  console.log(`E2E bootstrap target: ${target.source ?? "remote"} (${supabaseUrl})`);

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const clinicIdentity = deterministicIdentity("e2e.admin", projectRef);
  const portalIdentity = deterministicIdentity("e2e.portal", projectRef);
  const superAdminIdentity = deterministicIdentity("e2e.superadmin", projectRef);
  const doctorIdentity = deterministicIdentity("e2e.doctor", projectRef);

  const clinicSlug = process.env.E2E_CLINIC_SLUG || `e2e-clinic-${clinicIdentity.suffix}`;
  const clinicTenantId = await ensureTenant(adminClient, {
    slug: clinicSlug,
    name: "E2E Clinic",
    email: clinicIdentity.email,
  });

  await ensurePricingPlanSubscription(adminClient, clinicTenantId, "starter", "monthly");

  const adminPassword = process.env.E2E_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const clinicAdminEmail = process.env.E2E_ADMIN_EMAIL || clinicIdentity.email;

  const clinicAdminUser = await ensureTenantOwner(adminClient, {
    tenantId: clinicTenantId,
    email: clinicAdminEmail,
    password: adminPassword,
    fullName: "E2E Clinic Admin",
  });

  await ensureDoctor(adminClient, {
    tenantId: clinicTenantId,
    email: `${doctorIdentity.suffix}.doctor@${DEFAULT_EMAIL_DOMAIN}`,
    fullName: process.env.E2E_DOCTOR_NAME || "Dr E2E Automation",
  });

  const portalEmail = process.env.E2E_PORTAL_EMAIL || portalIdentity.email;
  const portalPassword = process.env.E2E_PORTAL_PASSWORD || adminPassword;

  const portalPatientId = await ensurePatient(adminClient, {
    tenantId: clinicTenantId,
    email: portalEmail,
    fullName: "E2E Portal Patient",
    dateOfBirth: "1992-04-12",
    gender: "female",
  });

  const foreignPatientId = await ensurePatient(adminClient, {
    tenantId: clinicTenantId,
    email: `e2e.foreign.${clinicIdentity.suffix}@${DEFAULT_EMAIL_DOMAIN}`,
    fullName: "E2E Foreign Patient",
    dateOfBirth: "1988-09-01",
    gender: "male",
  });

  let portalSessionReady = true;
  try {
    await ensurePortalUser(adminClient, {
      tenantId: clinicTenantId,
      patientId: portalPatientId,
      email: portalEmail,
      password: portalPassword,
      fullName: "E2E Portal Patient",
    });
  } catch (error) {
    portalSessionReady = false;
    await ensurePortalInvite(adminClient, {
      tenantId: clinicTenantId,
      patientId: portalPatientId,
    });
    console.warn(
      `Portal session bootstrap degraded to invite-only mode: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const superAdminPassword = process.env.E2E_SUPER_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const superAdminEmail = process.env.E2E_SUPER_ADMIN_EMAIL || superAdminIdentity.email;

  await ensureSuperAdmin(adminClient, {
    email: superAdminEmail,
    password: superAdminPassword,
    fullName: "E2E Super Admin",
  });

  const envFilePath = path.join(projectRoot, ".env.e2e.local");
  const envEntries = {
    E2E_SUPABASE_URL: supabaseUrl,
    E2E_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    E2E_SUPER_ADMIN_EMAIL: superAdminEmail,
    E2E_SUPER_ADMIN_PASSWORD: superAdminPassword,
    E2E_ADMIN_EMAIL: clinicAdminEmail,
    E2E_ADMIN_PASSWORD: adminPassword,
    E2E_CLINIC_SLUG: clinicSlug,
    E2E_CLINIC_NAME: "E2E Clinic",
    E2E_DOCTOR_NAME: process.env.E2E_DOCTOR_NAME || "Dr E2E Automation",
    E2E_PORTAL_EMAIL: portalEmail,
    E2E_PORTAL_FOREIGN_PATIENT_ID: foreignPatientId,
    E2E_PORTAL_UNINVITED_EMAIL: `portal-blocked.${crypto.randomUUID()}@example.com`,
  };

  if (portalSessionReady) {
    envEntries.E2E_PORTAL_PASSWORD = portalPassword;
  }

  writeEnvFile(envFilePath, envEntries);

  console.log(
    JSON.stringify(
      {
        ok: true,
        action: "bootstrap_e2e",
        clinic_slug: clinicSlug,
        env_file: ".env.e2e.local",
        portal_session_ready: portalSessionReady,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(JSON.stringify(error, null, 2));
  }
  process.exitCode = 1;
});
