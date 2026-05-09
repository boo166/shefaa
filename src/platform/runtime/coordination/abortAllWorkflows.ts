import { newRequestTraceId } from "@/platform/observability/traceContext";
import { inMemoryWorkflowStore } from "@/platform/runtime/workflows/inMemoryWorkflowStore";
import { workflowRuntimeRegistry } from "@/platform/runtime/workflows/workflowRuntimeRegistry";
import { runtimeEventBus } from "./runtimeEventBus";

/** Kernel-only: abort in-memory workflows during a runtime transition. */
export function abortAllWorkflowsForTransition(reason: string) {
  const ids = [...new Set([...inMemoryWorkflowStore.listWorkflowIds(), ...workflowRuntimeRegistry.listActive()])];
  workflowRuntimeRegistry.clearAll();
  for (const id of ids) void inMemoryWorkflowStore.clear(id);
  if (ids.length > 0) {
    runtimeEventBus.publish({
      type: "WORKFLOW_ABORTED",
      traceId: newRequestTraceId(),
      payload: { reason, workflowIds: ids.join(",") },
    });
  }
}
