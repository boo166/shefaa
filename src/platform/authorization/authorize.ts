import type { AppUser, Permission } from "@/core/auth/authStore";
import { useAuth } from "@/core/auth/authStore";
import { emitAuthMetric } from "@/services/auth/authMetrics";
import { CAPABILITY_TO_PERMISSION, permissionForCapability } from "./capabilityMap";
import type { Capability } from "./capabilities";
import { buildCapabilityGraph, resolveCapabilityConstraints } from "./capabilityGraph";

const CAPABILITY_GRAPH = buildCapabilityGraph({
  nodes: Object.keys(CAPABILITY_TO_PERMISSION).reduce<Record<string, any>>((acc, cap) => {
    acc[cap] = {
      capability: cap,
      constraints: cap === "platform.super_admin" ? { requiresAssurance: "aal2" } : undefined,
    };
    return acc;
  }, {}),
});

export type AuthorizeContext = {
  /** Explicit tenant scope for the resource being accessed (must match effective tenant for non–cross-tenant ops). */
  resourceTenantId?: string | null;
};

export type AuthorizeInput = {
  actor: Pick<AppUser, "id" | "tenantId" | "globalRoles" | "tenantRoles" | "tenantStatus"> | null;
  tenantOverride: { id: string } | null;
  sessionVersion: string | null;
  assuranceLevel: "aal1" | "aal2" | null;
  hasPermission: (p: Permission) => boolean;
  capability?: Capability;
  anyOfCapabilities?: Capability[];
  anyOfPermissions?: Permission[];
  context?: AuthorizeContext;
};

export type AuthorizeResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "unauthenticated"
        | "tenant_mismatch"
        | "tenant_suspended"
        | "missing_capability"
        | "unknown_capability"
        | "assurance_requirement_failed";
    };

function isSuperAdminActor(actor: Pick<AppUser, "globalRoles"> | null): boolean {
  return Boolean(actor?.globalRoles?.includes("super_admin"));
}

function selectEffectiveTenantIdLocal(
  actor: AuthorizeInput["actor"],
  tenantOverride: AuthorizeInput["tenantOverride"],
): string | null {
  if (!actor?.id) return null;
  if (isSuperAdminActor(actor)) return tenantOverride?.id ?? null;
  return actor.tenantId ?? null;
}

/**
 * Pure evaluation for tests and server-side adapters.
 */
export function evaluateAuthorize(input: AuthorizeInput): AuthorizeResult {
  const { actor, context, hasPermission } = input;
  if (!actor?.id) {
    return { ok: false, code: "unauthenticated" };
  }

  if (actor.tenantStatus && actor.tenantStatus !== "active" && !isSuperAdminActor(actor)) {
    return { ok: false, code: "tenant_suspended" };
  }

  const effTenant = selectEffectiveTenantIdLocal(actor, input.tenantOverride);
  const resTenant = context?.resourceTenantId;
  if (resTenant != null && resTenant.length > 0 && effTenant != null && resTenant !== effTenant) {
    return { ok: false, code: "tenant_mismatch" };
  }

  const perms = new Set<Permission>();

  const capabilityGraph = CAPABILITY_GRAPH;

  if (input.anyOfPermissions?.length) {
    for (const p of input.anyOfPermissions) perms.add(p);
  }

  if (input.capability) {
    const constraints = resolveCapabilityConstraints(capabilityGraph, input.capability);
    if (constraints.requiresAssurance && input.assuranceLevel !== constraints.requiresAssurance) {
      return { ok: false, code: "assurance_requirement_failed" };
    }
    const p = permissionForCapability(input.capability);
    if (!p) return { ok: false, code: "unknown_capability" };
    perms.add(p);
  }

  if (input.anyOfCapabilities?.length) {
    for (const c of input.anyOfCapabilities) {
      const constraints = resolveCapabilityConstraints(capabilityGraph, c);
      if (constraints.requiresAssurance && input.assuranceLevel !== constraints.requiresAssurance) {
        continue;
      }
      const p = permissionForCapability(c);
      if (!p) return { ok: false, code: "unknown_capability" };
      perms.add(p);
    }
  }

  if (perms.size === 0) {
    return { ok: false, code: "missing_capability" };
  }

  const allowed = [...perms].some((p) => hasPermission(p));
  if (!allowed) {
    return { ok: false, code: "missing_capability" };
  }

  return { ok: true };
}

/**
 * Record telemetry for denials (safe fields only).
 */
function emitDenial(input: AuthorizeInput, result: Extract<AuthorizeResult, { ok: false }>) {
  emitAuthMetric("authorization_denied", {
    code: result.code,
    capability: input.capability ?? input.anyOfCapabilities?.join(",") ?? "",
    permission: input.anyOfPermissions?.join(",") ?? "",
    hasResourceTenant: Boolean(input.context?.resourceTenantId),
  });
}

/**
 * Central authorization entry for the SPA. Backend RPC/RLS remains authoritative.
 */
export function authorize(input: Omit<AuthorizeInput, "actor" | "tenantOverride" | "hasPermission" | "sessionVersion"> & {
  context?: AuthorizeContext;
}): AuthorizeResult {
  const state = useAuth.getState();
  const full: AuthorizeInput = {
    actor: state.user,
    tenantOverride: state.tenantOverride,
    sessionVersion: state.sessionVersion,
    assuranceLevel: state.privilegedAuth?.currentLevel ?? null,
    hasPermission: state.hasPermission,
    ...input,
  };
  const result = evaluateAuthorize(full);
  if (!result.ok) {
    emitDenial(full, result);
  }
  return result;
}

/** Capability graph: list all registered capabilities (for docs/CI). */
export function listRegisteredCapabilities(): string[] {
  return Object.keys(CAPABILITY_TO_PERMISSION).sort();
}
