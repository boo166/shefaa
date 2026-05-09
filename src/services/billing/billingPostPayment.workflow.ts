import { useAuth } from "@/core/auth/authStore";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { buildTracePayload } from "@/platform/observability/traceContext";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { resolveRuntimePolicy } from "@/platform/runtime/policy";
import { createWorkflow } from "@/platform/runtime/workflows/createWorkflow";
import type { InvoicePaymentCommandResult } from "@/domain/billing/billing.types";

export type BillingPostPaymentWorkflowInput = {
  invoiceId: string;
  tenantId: string;
  userId: string | null;
  idempotencyKey: string;
  postAtomic: () => Promise<InvoicePaymentCommandResult>;
};

/**
 * Pay → post-step telemetry → reconcile tick (metrics). Compensation is observability-only (no automatic money reversal).
 */
export async function runBillingPostPaymentWorkflow(
  input: BillingPostPaymentWorkflowInput,
): Promise<{ command: InvoicePaymentCommandResult; workflowTraceId: string }> {
  const auth = useAuth.getState();
  const policy = resolveRuntimePolicy({
    operation: "billing.workflow.post_payment",
    operationClass: "financial",
    assuranceLevel: auth.privilegedAuth?.currentLevel ?? null,
    runtimeState: runtimeModeController.getSnapshot().effective,
    tenantStatus: auth.user?.tenantStatus ?? null,
  });

  const trace = buildTracePayload({
    tenantId: input.tenantId,
    actorId: input.userId ?? undefined,
  });

  let command: InvoicePaymentCommandResult | null = null;
  const workflowId = `billing-payment:${input.invoiceId}:${input.idempotencyKey}`;

  const wf = createWorkflow({
    workflowId,
    workflowVersion: 1,
    policy,
    trace,
    steps: [
      {
        id: "post_atomic",
        run: async () => {
          command = await input.postAtomic();
        },
        compensate: async () => {
          emitPlatformMetric("billing.workflow.compensate_post", {
            invoiceId: input.invoiceId,
            tenantId: input.tenantId,
          });
        },
      },
      {
        id: "notify_fanout",
        run: async () => {
          emitPlatformMetric("billing.workflow.step", {
            step: "notify_fanout",
            invoiceId: input.invoiceId,
            tenantId: input.tenantId,
          });
        },
      },
      {
        id: "reconcile_mark",
        run: async () => {
          emitPlatformMetric("billing.workflow.step", {
            step: "reconcile_mark",
            invoiceId: input.invoiceId,
            tenantId: input.tenantId,
          });
        },
      },
    ],
  });

  await wf.run();
  if (!command) {
    throw new Error("billing workflow completed without payment command result");
  }
  return { command, workflowTraceId: wf.workflowTraceId };
}
