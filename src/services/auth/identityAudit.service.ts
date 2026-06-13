import type { IdentityAuditAction, IdentityAuditInput } from "./identityAudit.types";
import { identityAuditRepository } from "./identityAudit.repository";

function sanitizeLoginFailureDetails(details?: Record<string, unknown> | null) {
  const email = typeof details?.email === "string" ? details.email.trim().toLowerCase() : null;
  if (!email) return { outcome: "failed" as const };
  const at = email.indexOf("@");
  const domain = at > 0 ? email.slice(at + 1) : "unknown";
  return { outcome: "failed" as const, email_domain: domain };
}

export const identityAuditService = {
  async logEvent(input: IdentityAuditInput): Promise<void> {
    const details =
      input.action === "LOGIN_FAILED"
        ? sanitizeLoginFailureDetails(input.details)
        : (input.details ?? null);

    await identityAuditRepository.logEvent({
      action: input.action,
      userId: input.userId ?? null,
      tenantId: input.tenantId ?? null,
      actorUserId: input.actorUserId ?? input.userId ?? null,
      entityType: input.entityType ?? "identity",
      entityId: input.entityId ?? input.userId ?? null,
      details,
      requestTraceId: input.requestTraceId ?? null,
    });
  },

  logEventFireAndForget(input: IdentityAuditInput): void {
    void this.logEvent(input).catch(() => {
      /* audit must not block auth flows */
    });
  },

  logAction(
    action: IdentityAuditAction,
    params: Omit<IdentityAuditInput, "action"> = {},
  ): void {
    this.logEventFireAndForget({ action, ...params });
  },
};
