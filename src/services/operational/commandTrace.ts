import type { PlatformTraceIds } from "@/platform/observability/traceContext";

export function commandTraceParams(trace?: Partial<PlatformTraceIds>) {
  return {
    p_request_trace_id: trace?.requestTraceId ?? null,
    p_operation_trace_id: trace?.operationTraceId ?? null,
    p_workflow_trace_id: trace?.workflowTraceId ?? null,
  };
}
