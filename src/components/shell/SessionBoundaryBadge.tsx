import { isSuperAdmin, useAuth } from "@/core/auth/authStore";
import { cn } from "@/lib/utils";

/**
 * Persistent tenant / role / assurance indicators for the operational shell.
 */
export function SessionBoundaryBadge({ className }: { className?: string }) {
  const user = useAuth((s) => s.user);
  const tenantOverride = useAuth((s) => s.tenantOverride);
  const impersonationSession = useAuth((s) => s.impersonationSession);
  const authMachineState = useAuth((s) => s.authMachineState);
  const privilegedAuth = useAuth((s) => s.privilegedAuth);

  if (!user) return null;

  const tenantLabel =
    isSuperAdmin(user) && tenantOverride
      ? tenantOverride.name
      : user.tenantName ?? "—";

  const roleParts = [...user.globalRoles, ...user.tenantRoles];
  const roleLabel = roleParts.length ? roleParts.join(", ") : "—";

  const aal =
    privilegedAuth.currentLevel === "aal2"
      ? "AAL2"
      : privilegedAuth.currentLevel === "aal1"
        ? "AAL1"
        : "AAL?";

  const degraded =
    authMachineState !== "authenticated" && authMachineState !== "initializing"
      ? authMachineState.replace(/_/g, " ")
      : null;

  return (
    <div
      className={cn(
        "hidden max-w-[min(420px,40vw)] flex-col gap-0.5 text-left text-[10px] leading-tight text-muted-foreground md:flex",
        className,
      )}
      data-testid="session-boundary-badge"
    >
      <span className="truncate font-medium text-foreground/90" title={tenantLabel}>
        Tenant: {tenantLabel}
      </span>
      <span className="truncate" title={roleLabel}>
        Role: {roleLabel} · {aal}
      </span>
      {impersonationSession && (
        <span className="truncate text-amber-600 dark:text-amber-400">Impersonation active</span>
      )}
      {degraded && (
        <span className="truncate text-amber-600 dark:text-amber-400">Session: {degraded}</span>
      )}
    </div>
  );
}
