import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import {
  billingReconciliationFindingSchema,
  billingReconciliationRunSchema,
  billingReconciliationSummarySchema,
} from "@/domain/billing/billing.schema";
import type {
  BillingReconciliationFinding,
  BillingReconciliationRun,
  BillingReconciliationSummary,
} from "@/domain/billing/billing.types";
import { getTenantContext } from "@/services/supabase/tenant";
import { toServiceError } from "@/services/supabase/errors";
import { billingReconciliationRepository } from "./billingReconciliation.repository";

/** Emitted after a successful payment command for ops dashboards (no PII). */
export function emitBillingReconciliationTick(input: {
  tenantId: string;
  invoiceId: string;
  resultCode: string;
  idempotencyReplay: boolean;
  workflowTraceId?: string;
  operationTraceId?: string;
  requestTraceId?: string;
  latestFindingCount?: number;
  latestCriticalCount?: number;
}) {
  emitPlatformMetric("billing.reconciliation_tick", {
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    resultCode: input.resultCode,
    idempotencyReplay: input.idempotencyReplay,
    workflowTraceId: input.workflowTraceId ?? "",
    operationTraceId: input.operationTraceId ?? "",
    requestTraceId: input.requestTraceId ?? "",
    latestFindingCount: input.latestFindingCount,
    latestCriticalCount: input.latestCriticalCount,
  });
}

function defaultWindow(days = 30) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
  };
}

export const billingReconciliationService = {
  async runDry(input?: { windowStart?: string; windowEnd?: string }): Promise<BillingReconciliationSummary> {
    try {
      const { tenantId } = getTenantContext();
      const window = defaultWindow();
      const summary = billingReconciliationSummarySchema.parse(
        await billingReconciliationRepository.run({
          tenantId,
          windowStart: input?.windowStart ?? window.windowStart,
          windowEnd: input?.windowEnd ?? window.windowEnd,
          dryRun: true,
        }),
      );
      emitPlatformMetric("billing.reconciliation_run.completed", {
        tenantId,
        dryRun: true,
        findingCount: summary.finding_count,
        criticalCount: summary.critical_count,
      });
      emitPlatformMetric("billing.reconciliation_findings.open", {
        tenantId,
        count: summary.finding_count,
      });
      emitPlatformMetric("billing.reconciliation_findings.critical", {
        tenantId,
        count: summary.critical_count,
      });
      return summary;
    } catch (err) {
      throw toServiceError(err, "Failed to run billing reconciliation");
    }
  },

  async getLatestRun(): Promise<BillingReconciliationRun | null> {
    try {
      const { tenantId } = getTenantContext();
      const run = await billingReconciliationRepository.getLatestRun(tenantId);
      return run ? billingReconciliationRunSchema.parse(run) : null;
    } catch (err) {
      throw toServiceError(err, "Failed to load billing reconciliation run");
    }
  },

  async listOpenFindings(limit = 10): Promise<BillingReconciliationFinding[]> {
    try {
      const { tenantId } = getTenantContext();
      return billingReconciliationFindingSchema.array().parse(
        await billingReconciliationRepository.listOpenFindings(tenantId, limit),
      );
    } catch (err) {
      throw toServiceError(err, "Failed to load billing reconciliation findings");
    }
  },

  async getOpsSnapshot(): Promise<{
    latestRun: BillingReconciliationRun | null;
    openFindings: BillingReconciliationFinding[];
  }> {
    try {
      const { tenantId } = getTenantContext();
      const [latestRun, openFindings] = await Promise.all([
        billingReconciliationRepository.getLatestRun(tenantId),
        billingReconciliationRepository.listOpenFindings(tenantId, 8),
      ]);
      return {
        latestRun: latestRun ? billingReconciliationRunSchema.parse(latestRun) : null,
        openFindings: billingReconciliationFindingSchema.array().parse(openFindings),
      };
    } catch (err) {
      throw toServiceError(err, "Failed to load billing reconciliation operations snapshot");
    }
  },
};
