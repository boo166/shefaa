import type { AuthenticatorAssuranceLevel, TenantStatus } from "@/core/auth/authStore";
import type { Capability } from "./capabilities";

export type CapabilityEnvironment = "prod" | "staging" | "dev" | "test";

export type CapabilityConstraint = {
  requiresAssurance?: Exclude<AuthenticatorAssuranceLevel, null>;
  environments?: CapabilityEnvironment[];
  /** If set, only these tenant statuses may exercise the capability. */
  allowedTenantStatuses?: TenantStatus[];
  /**
   * Optional local-time window constraint, evaluated at runtime on the client.
   * This is a capability-level constraint (policy-level time freezes still belong in policy kernel).
   */
  timeWindows?: Array<{ tz: string; start: string; end: string }>;
  emergencyOverride?: { capability: Capability; reasonRequired: boolean };
};

export type CapabilityNode = {
  capability: Capability;
  parents?: Capability[];
  tenantScoped?: boolean;
  constraints?: CapabilityConstraint;
};

export type CapabilityGraph = {
  nodes: Record<string, CapabilityNode>;
  registered: ReadonlySet<string>;
};

export function buildCapabilityGraph(input: { nodes: Record<string, CapabilityNode> }): CapabilityGraph {
  const registered = new Set(Object.keys(input.nodes));

  // Implicit parent edges: longest registered prefix
  for (const cap of registered) {
    const node = input.nodes[cap];
    const explicit = new Set(node.parents ?? []);
    const parts = cap.split(".");
    for (let i = parts.length - 1; i >= 1; i--) {
      const parent = parts.slice(0, i).join(".");
      if (registered.has(parent)) {
        explicit.add(parent);
        break;
      }
    }
    if (explicit.size) node.parents = [...explicit];
  }

  return { nodes: input.nodes, registered };
}

export function ancestorsOf(graph: CapabilityGraph, capability: Capability): Capability[] {
  const visited = new Set<string>();
  const out: Capability[] = [];
  const stack = [capability];
  while (stack.length) {
    const cur = stack.pop()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const node = graph.nodes[cur];
    const parents = node?.parents ?? [];
    for (const p of parents) {
      out.push(p);
      stack.push(p);
    }
  }
  return out;
}

export function maxAssurance(a: AuthenticatorAssuranceLevel, b: AuthenticatorAssuranceLevel): AuthenticatorAssuranceLevel {
  const rank: Record<string, number> = { aal1: 1, aal2: 2 };
  const ar = a ? rank[a] : 0;
  const br = b ? rank[b] : 0;
  if (ar >= br) return a;
  return b;
}

export function resolveCapabilityConstraints(graph: CapabilityGraph, capability: Capability): CapabilityConstraint {
  const chain = [capability, ...ancestorsOf(graph, capability)];
  const merged: CapabilityConstraint = {};

  for (const cap of chain) {
    const node = graph.nodes[cap];
    const c = node?.constraints;
    if (!c) continue;
    if (c.requiresAssurance) {
      merged.requiresAssurance = maxAssurance(merged.requiresAssurance ?? null, c.requiresAssurance);
    }
    if (c.environments?.length) {
      merged.environments = Array.from(new Set([...(merged.environments ?? []), ...c.environments]));
    }
    if (c.allowedTenantStatuses?.length) {
      merged.allowedTenantStatuses = Array.from(
        new Set([...(merged.allowedTenantStatuses ?? []), ...c.allowedTenantStatuses]),
      ) as TenantStatus[];
    }
    if (c.timeWindows?.length) {
      merged.timeWindows = [...(merged.timeWindows ?? []), ...c.timeWindows];
    }
    if (c.emergencyOverride) {
      merged.emergencyOverride = c.emergencyOverride;
    }
  }

  return merged;
}

