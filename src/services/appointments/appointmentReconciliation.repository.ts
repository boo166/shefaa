import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

export type AppointmentReconciliationSummary = {
  run_id: string | null;
  finding_count: number;
  critical_count: number;
  warning_count: number;
};

export type AppointmentReconciliationFinding = {
  id: string;
  run_id: string;
  tenant_id: string;
  appointment_id: string | null;
  queue_id: string | null;
  finding_code: string;
  severity: "critical" | "warning";
  status: string;
  evidence: Record<string, unknown> | null;
  detected_at: string;
  resolved_at: string | null;
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
    subsystem: "appointments",
  };
}

const FINDING_COLUMNS = [
  "id",
  "run_id",
  "tenant_id",
  "appointment_id",
  "queue_id",
  "finding_code",
  "severity",
  "status",
  "evidence",
  "detected_at",
  "resolved_at",
].join(", ");

export const appointmentReconciliationRepository = {
  async run(input: {
    tenantId: string;
    windowStart: string;
    windowEnd: string;
    dryRun: boolean;
    requestTraceId?: string | null;
    operationTraceId?: string | null;
    workflowTraceId?: string | null;
  }): Promise<AppointmentReconciliationSummary> {
    const { data, error } = await platformRepository.rpc(
      "run_appointment_reconciliation",
      {
        p_tenant_id: input.tenantId,
        p_window_start: input.windowStart,
        p_window_end: input.windowEnd,
        p_dry_run: input.dryRun,
        p_request_trace_id: input.requestTraceId ?? null,
        p_operation_trace_id: input.operationTraceId ?? null,
        p_workflow_trace_id: input.workflowTraceId ?? null,
      },
      reconciliationCtx(input.tenantId, "appointments.reconciliation.run", input.dryRun ? "readonly" : "tenant-critical"),
    );

    if (error) {
      throw new ServiceError(error.message ?? "Failed to run appointment reconciliation", {
        code: error.code,
        details: error,
      });
    }

    const row = (data as AppointmentReconciliationSummary[] | null)?.[0];
    if (!row) {
      throw new ServiceError("Appointment reconciliation returned no result", {
        code: "APPOINTMENT_RECONCILIATION_EMPTY_RESULT",
      });
    }
    return row;
  },

  async listOpenFindings(tenantId: string, limit = 10): Promise<AppointmentReconciliationFinding[]> {
    const { data, error } = await platformRepository
      .from("appointment_reconciliation_findings", reconciliationCtx(tenantId, "appointments.reconciliation.openFindings"))
      .select(FINDING_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("status", ["OPEN", "ACKNOWLEDGED", "INVESTIGATING"])
      .order("severity", { ascending: true })
      .order("detected_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load appointment reconciliation findings", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as AppointmentReconciliationFinding[];
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
