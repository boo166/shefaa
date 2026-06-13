export const IDENTITY_AUDIT_ACTIONS = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "MFA_ENROLLED",
  "MFA_REMOVED",
  "MFA_CHALLENGE_FAILED",
  "RECOVERY_CODE_USED",
  "INVITE_ACCEPTED",
  "ROLE_CHANGED",
  "USER_SUSPENDED",
  "USER_REACTIVATED",
] as const;

export type IdentityAuditAction = (typeof IDENTITY_AUDIT_ACTIONS)[number];

export type IdentityAuditInput = {
  action: IdentityAuditAction;
  userId?: string | null;
  tenantId?: string | null;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  requestTraceId?: string | null;
};
