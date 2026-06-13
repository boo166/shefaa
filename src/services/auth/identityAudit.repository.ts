import { supabase } from "@/services/supabase/client";

function clientIpHint(): string | null {
  if (typeof window === "undefined") return null;
  return null;
}

function clientUserAgent(): string | null {
  if (typeof navigator === "undefined") return null;
  return navigator.userAgent?.slice(0, 512) ?? null;
}

export const identityAuditRepository = {
  async logEvent(input: {
    action: string;
    userId?: string | null;
    tenantId?: string | null;
    actorUserId?: string | null;
    entityType?: string;
    entityId?: string | null;
    details?: Record<string, unknown> | null;
    requestTraceId?: string | null;
  }): Promise<void> {
    const { error } = await supabase.rpc("log_identity_audit_event", {
      _action: input.action,
      _user_id: input.userId ?? null,
      _tenant_id: input.tenantId ?? null,
      _actor_user_id: input.actorUserId ?? null,
      _entity_type: input.entityType ?? "identity",
      _entity_id: input.entityId ?? null,
      _details: input.details ?? null,
      _request_id: input.requestTraceId ?? null,
      _ip_address: clientIpHint(),
      _user_agent: clientUserAgent(),
    });

    if (error) {
      throw new Error(error.message ?? "Failed to write identity audit event");
    }
  },
};
