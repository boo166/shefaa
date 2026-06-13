import { auditLogSchema } from "@/domain/settings/audit.schema";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { auditLogRepository } from "./audit.repository";
import { z } from "zod";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export const auditLogService = {
  async listPaged(input?: { page?: number; pageSize?: number }) {
    try {
      const parsed = paginationSchema.parse(input ?? {});
      const { tenantId } = getTenantContext();
      const { data, count } = await auditLogRepository.listPaged(
        tenantId,
        parsed.pageSize,
        (parsed.page - 1) * parsed.pageSize
      );
      return { data: z.array(auditLogSchema).parse(data), total: count };
    } catch (err) {
      throw toServiceError(err, "Failed to load audit logs");
    }
  },
  async listIdentityPaged(input?: { page?: number; pageSize?: number }) {
    try {
      const parsed = paginationSchema.parse(input ?? {});
      const { tenantId } = getTenantContext();
      const { data, count } = await auditLogRepository.listIdentityPaged(
        tenantId,
        parsed.pageSize,
        (parsed.page - 1) * parsed.pageSize
      );
      return { data: z.array(auditLogSchema).parse(data), total: count };
    } catch (err) {
      throw toServiceError(err, "Failed to load identity audit logs");
    }
  },
  async logEvent(input: {
    tenant_id?: string | null;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    details?: Record<string, unknown> | null;
    request_id?: string | null;
    action_type?: string | null;
    resource_type?: string | null;
  }) {
    try {
      await auditLogRepository.logEvent(input);
    } catch (err) {
      throw toServiceError(err, "Failed to write audit log");
    }
  },
};
