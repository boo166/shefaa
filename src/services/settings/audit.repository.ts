import type { AuditLog } from "@/domain/settings/audit.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const AUDIT_COLUMNS = "id, tenant_id, user_id, action, entity_type, entity_id, details, ip_address, created_at";

export interface AuditLogRepository {
  listRecent(tenantId: string, limit?: number): Promise<AuditLog[]>;
}

export const auditLogRepository: AuditLogRepository = {
  async listRecent(tenantId, limit = 50) {
    const { data, error } = await supabase
      .from("audit_logs")
      .select(AUDIT_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load audit logs", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AuditLog[];
  },
};
