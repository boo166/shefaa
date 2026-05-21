import type {
  BillingReconciliationFinding,
  BillingReconciliationRun,
  BillingReconciliationSummary,
} from "@/domain/billing/billing.types";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

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
    subsystem: classification === "financial" ? "billing" : undefined,
  };
}

const RUN_COLUMNS = [
  "id",
  "tenant_id",
  "window_start",
  "window_end",
  "checked_invoice_count",
  "checked_payment_count",
  "finding_count",
  "critical_count",
  "warning_count",
  "status",
  "request_trace_id",
  "operation_trace_id",
  "workflow_trace_id",
  "causal_parent_id",
  "failure_kind",
  "runtime_effect",
  "recovery_contract",
  "evidence_metadata",
  "started_at",
  "completed_at",
  "created_at",
].join(", ");

const FINDING_COLUMNS = [
  "id",
  "run_id",
  "tenant_id",
  "invoice_id",
  "payment_id",
  "idempotency_id",
  "finding_code",
  "severity",
  "status",
  "evidence",
  "request_trace_id",
  "operation_trace_id",
  "workflow_trace_id",
  "causal_parent_id",
  "failure_kind",
  "runtime_effect",
  "recovery_contract",
  "evidence_metadata",
  "detected_at",
  "resolved_at",
].join(", ");

export type BillingReconciliationFindingStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "INVESTIGATING"
  | "RESOLVED"
  | "FALSE_POSITIVE";

export const billingReconciliationRepository = {
  async run(input: {
    tenantId: string;
    windowStart: string;
    windowEnd: string;
    dryRun: boolean;
  }): Promise<BillingReconciliationSummary> {
    const { data, error } = await platformRepository.rpc(
      "run_billing_reconciliation",
      {
        _tenant_id: input.tenantId,
        _window_start: input.windowStart,
        _window_end: input.windowEnd,
        _dry_run: input.dryRun,
      },
      reconciliationCtx(input.tenantId, "billing.reconciliation.run", input.dryRun ? "readonly" : "financial"),
    );

    if (error) {
      throw new ServiceError(error.message ?? "Failed to run billing reconciliation", {
        code: error.code,
        details: error,
      });
    }

    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Billing reconciliation returned no result", {
        code: "BILLING_RECONCILIATION_EMPTY_RESULT",
      });
    }
    return row as BillingReconciliationSummary;
  },

  async getLatestRun(tenantId: string): Promise<BillingReconciliationRun | null> {
    const { data, error } = await platformRepository
      .from("billing_reconciliation_runs", reconciliationCtx(tenantId, "billing.reconciliation.latestRun"))
      .select(RUN_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load billing reconciliation run", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? null) as BillingReconciliationRun | null;
  },

  async listOpenFindings(tenantId: string, limit = 10): Promise<BillingReconciliationFinding[]> {
    const { data, error } = await platformRepository
      .from("billing_reconciliation_findings", reconciliationCtx(tenantId, "billing.reconciliation.openFindings"))
      .select(FINDING_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("status", ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"])
      .order("severity", { ascending: true })
      .order("detected_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load billing reconciliation findings", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as BillingReconciliationFinding[];
  },

  async updateFindingStatus(
    tenantId: string,
    findingId: string,
    status: BillingReconciliationFindingStatus,
  ): Promise<BillingReconciliationFinding> {
    const resolvedAt = status === "RESOLVED" || status === "FALSE_POSITIVE"
      ? new Date().toISOString()
      : null;
    const { data, error } = await platformRepository
      .from("billing_reconciliation_findings", reconciliationCtx(tenantId, "billing.reconciliation.updateFindingStatus", "financial"))
      .update({ status, resolved_at: resolvedAt })
      .eq("tenant_id", tenantId)
      .eq("id", findingId)
      .select(FINDING_COLUMNS)
      .single();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to update billing reconciliation finding", {
        code: error.code,
        details: error,
      });
    }

    return data as BillingReconciliationFinding;
  },

  describe() {
    return {
      certified: false,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: false,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [],
      exceptions: [
        "Billing reconciliation is operationally converged but still lacks repository-level capability metadata.",
      ],
    };
  },
};
