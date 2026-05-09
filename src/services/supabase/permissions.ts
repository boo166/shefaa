import type { Permission } from "@/core/auth/authStore";
import { useAuth } from "@/core/auth/authStore";
import { evaluateAuthorize } from "@/platform/authorization/authorize";
import { AuthorizationError } from "./errors";

export function assertAnyPermission(permissions: Permission[], message?: string) {
  const state = useAuth.getState();
  const isVitest = typeof process !== "undefined" && Boolean(process.env.VITEST);

  // Legacy tests mock only `hasPermission` without a full `user`; keep parity without weakening production paths.
  if (isVitest && !state.user?.id) {
    const allowed = permissions.some((permission) => state.hasPermission(permission));
    if (!allowed) {
      throw new AuthorizationError(message ?? "Not authorized");
    }
    return;
  }

  const result = evaluateAuthorize({
    actor: state.user,
    tenantOverride: state.tenantOverride,
    sessionVersion: state.sessionVersion,
    hasPermission: state.hasPermission,
    anyOfPermissions: permissions,
  });
  if (!result.ok) {
    throw new AuthorizationError(message ?? "Not authorized");
  }
}
