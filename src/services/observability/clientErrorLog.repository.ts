import type { ClientErrorLogCreateInput } from "@/domain/settings/clientErrorLog.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

export interface ClientErrorLogRepository {
  insert(input: ClientErrorLogCreateInput): Promise<void>;
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
    exceptions?: string[];
  };
}

export const clientErrorLogRepository: ClientErrorLogRepository = {
  async insert(input) {
    const { error } = await supabase.from("client_error_logs").insert({
      tenant_id: input.tenant_id,
      user_id: input.user_id,
      request_id: input.request_id ?? null,
      action_type: input.action_type ?? null,
      resource_type: input.resource_type ?? null,
      metadata: input.metadata ?? null,
      message: input.message,
      stack: input.stack ?? null,
      component_stack: input.component_stack ?? null,
      url: input.url ?? null,
      user_agent: input.user_agent ?? null,
    });
    if (error) {
      throw new ServiceError(error.message ?? "Failed to log client error", { code: error.code, details: error });
    }
  },
  describe() {
    return {
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: false,
      capabilityAware: false,
      reconciliationAware: false,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: false,
      staleContextSafe: false,
      metricsEnabled: false,
      requiredCapabilities: [],
      exceptions: [
        "Client error logging is intentionally best-effort and still writes through the raw Supabase baseline path.",
      ],
    };
  },
};
