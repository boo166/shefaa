import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

export type NotificationReconciliationSummary = {
  run_id: string | null;
  finding_count: number;
  critical_count: number;
  warning_count: number;
};

function reconciliationCtx(
  tenantId: string,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "readonly",
): PlatformRepositoryContext {
  return {
    action,
    classification,
    tenantScoped: true,
    tenantId,
    subsystem: "notifications",
  };
}

export const notificationReconciliationRepository = {
  async run(input: {
    tenantId: string;
    windowStart: string;
    windowEnd: string;
    dryRun: boolean;
    requestTraceId?: string | null;
    operationTraceId?: string | null;
    workflowTraceId?: string | null;
  }): Promise<NotificationReconciliationSummary> {
    const { data, error } = await platformRepository.rpc(
      "run_notification_reconciliation",
      {
        p_tenant_id: input.tenantId,
        p_window_start: input.windowStart,
        p_window_end: input.windowEnd,
        p_dry_run: input.dryRun,
        p_request_trace_id: input.requestTraceId ?? null,
        p_operation_trace_id: input.operationTraceId ?? null,
        p_workflow_trace_id: input.workflowTraceId ?? null,
      },
      reconciliationCtx(input.tenantId, "notifications.reconciliation.run", input.dryRun ? "readonly" : "tenant-critical"),
    );

    if (error) {
      throw new ServiceError(error.message ?? "Failed to run notification reconciliation", {
        code: error.code,
        details: error,
      });
    }

    const row = (data as NotificationReconciliationSummary[] | null)?.[0];
    if (!row) {
      throw new ServiceError("Notification reconciliation returned no result", {
        code: "NOTIFICATION_RECONCILIATION_EMPTY_RESULT",
      });
    }
    return row;
  },

  describe() {
    return {
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [],
    };
  },
};
