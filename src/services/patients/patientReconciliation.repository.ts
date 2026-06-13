import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

export type PatientReconciliationSummary = {
  run_id: string | null;
  finding_count: number;
  critical_count: number;
  warning_count: number;
};

export type PatientReconciliationRun = {
  id: string;
  tenant_id: string;
  window_start: string;
  window_end: string;
  finding_count: number;
  critical_count: number;
  warning_count: number;
  request_trace_id: string | null;
  operation_trace_id: string | null;
  workflow_trace_id: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export type PatientReconciliationFinding = {
  id: string;
  run_id: string;
  tenant_id: string;
  patient_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  finding_code: string;
  severity: "critical" | "warning" | "info";
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
    subsystem: "patients",
  };
}

const RUN_COLUMNS = [
  "id",
  "tenant_id",
  "window_start",
  "window_end",
  "finding_count",
  "critical_count",
  "warning_count",
  "request_trace_id",
  "operation_trace_id",
  "workflow_trace_id",
  "started_at",
  "completed_at",
  "created_at",
].join(", ");

const FINDING_COLUMNS = [
  "id",
  "run_id",
  "tenant_id",
  "patient_id",
  "related_entity_type",
  "related_entity_id",
  "finding_code",
  "severity",
  "status",
  "evidence",
  "created_at",
  "resolved_at",
].join(", ");

const OPEN_FINDING_STATUSES = ["open", "acknowledged"] as const;

function mapFindingRow(row: Record<string, unknown>): PatientReconciliationFinding {
  return {
    ...(row as Omit<PatientReconciliationFinding, "detected_at">),
    detected_at: String(row.created_at ?? row.detected_at ?? ""),
  };
}

export const patientReconciliationRepository = {
  async run(input: {
    tenantId: string;
    windowStart: string;
    windowEnd: string;
    dryRun: boolean;
    requestTraceId?: string | null;
    operationTraceId?: string | null;
    workflowTraceId?: string | null;
  }): Promise<PatientReconciliationSummary> {
    const { data, error } = await platformRepository.rpc(
      "run_patient_reconciliation",
      {
        p_tenant_id: input.tenantId,
        p_window_start: input.windowStart,
        p_window_end: input.windowEnd,
        p_dry_run: input.dryRun,
        p_request_trace_id: input.requestTraceId ?? null,
        p_operation_trace_id: input.operationTraceId ?? null,
        p_workflow_trace_id: input.workflowTraceId ?? null,
      },
      reconciliationCtx(input.tenantId, "patients.reconciliation.run", input.dryRun ? "readonly" : "tenant-critical"),
    );

    if (error) {
      throw new ServiceError(error.message ?? "Failed to run patient reconciliation", {
        code: error.code,
        details: error,
      });
    }

    const row = (data as PatientReconciliationSummary[] | null)?.[0];
    if (!row) {
      throw new ServiceError("Patient reconciliation returned no result", {
        code: "PATIENT_RECONCILIATION_EMPTY_RESULT",
      });
    }
    return row;
  },

  async getLatestRun(tenantId: string): Promise<PatientReconciliationRun | null> {
    const { data, error } = await platformRepository
      .from("patient_reconciliation_runs", reconciliationCtx(tenantId, "patients.reconciliation.latestRun"))
      .select(RUN_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient reconciliation run", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? null) as PatientReconciliationRun | null;
  },

  async listOpenFindings(tenantId: string, limit = 10): Promise<PatientReconciliationFinding[]> {
    const { data, error } = await platformRepository
      .from("patient_reconciliation_findings", reconciliationCtx(tenantId, "patients.reconciliation.openFindings"))
      .select(FINDING_COLUMNS)
      .eq("tenant_id", tenantId)
      .in("status", [...OPEN_FINDING_STATUSES])
      .order("severity", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load patient reconciliation findings", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []).map((row) => mapFindingRow(row as Record<string, unknown>));
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
        "Patient reconciliation is operationally converged but still lacks repository-level capability metadata.",
      ],
    };
  },
};
