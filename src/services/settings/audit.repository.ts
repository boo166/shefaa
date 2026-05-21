import type { AuditLog } from "@/domain/settings/audit.types";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

const AUDIT_COLUMNS =
  "id, tenant_id, user_id, actor_id, action, action_type, request_id, entity_type, resource_type, entity_id, resource_id, details, metadata, ip_address, created_at";

function auditCtx(
  action: string,
  tenantId?: string | null,
  classification: PlatformRepositoryContext["classification"] = "readonly",
): PlatformRepositoryContext {
  return {
    action,
    classification,
    tenantScoped: Boolean(tenantId),
    tenantId: tenantId ?? null,
  };
}

export interface AuditLogRepository {
  listPaged(tenantId: string, limit: number, offset: number): Promise<{ data: AuditLog[]; count: number }>;
  logEvent(input: {
    tenant_id?: string | null;
    user_id: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    details?: Record<string, unknown> | null;
    request_id?: string | null;
    action_type?: string | null;
    resource_type?: string | null;
  }): Promise<void>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    traceAware: boolean;
    runtimeAware: boolean;
    capabilityAware: boolean;
    reconciliationAware: boolean;
    recoveryAware: boolean;
    evidenceAware: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

export const auditLogRepository: AuditLogRepository = {
  async listPaged(tenantId, limit, offset) {
    const to = Math.max(0, offset + limit - 1);
    const { data, error, count } = await platformRepository
      .from("audit_logs", auditCtx("settings.audit.listPaged", tenantId))
      .select(AUDIT_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, to);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load audit logs", {
        code: error.code,
        details: error,
      });
    }

    return { data: (data ?? []) as AuditLog[], count: count ?? 0 };
  },
  async logEvent(input) {
    const { error } = await platformRepository.rpc(
      "log_audit_event",
      {
        _tenant_id: input.tenant_id ?? null,
        _user_id: input.user_id,
        _action: input.action,
        _entity_type: input.entity_type,
        _entity_id: input.entity_id ?? null,
        _details: input.details ?? null,
        _request_id: input.request_id ?? null,
        _action_type: input.action_type ?? null,
        _resource_type: input.resource_type ?? null,
      },
      auditCtx("settings.audit.logEvent", input.tenant_id, "eventual"),
    );

    if (error) {
      throw new ServiceError(error.message ?? "Failed to write audit log", { code: error.code, details: error });
    }
  },
  describe() {
    return {
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: false,
      reconciliationAware: false,
      recoveryAware: false,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [],
      exceptions: [
        "Audit log repository does not yet declare capability metadata for admin/settings reads.",
      ],
    };
  },
};
