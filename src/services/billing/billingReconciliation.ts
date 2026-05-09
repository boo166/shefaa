import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";

/** Emitted after a successful payment command for ops dashboards (no PII). */
export function emitBillingReconciliationTick(input: {
  tenantId: string;
  invoiceId: string;
  resultCode: string;
  idempotencyReplay: boolean;
  workflowTraceId?: string;
  operationTraceId?: string;
  requestTraceId?: string;
}) {
  emitPlatformMetric("billing.reconciliation_tick", {
    tenantId: input.tenantId,
    invoiceId: input.invoiceId,
    resultCode: input.resultCode,
    idempotencyReplay: input.idempotencyReplay,
    workflowTraceId: input.workflowTraceId ?? "",
    operationTraceId: input.operationTraceId ?? "",
    requestTraceId: input.requestTraceId ?? "",
  });
}
