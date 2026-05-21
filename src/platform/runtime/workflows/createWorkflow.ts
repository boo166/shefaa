import { selectEffectiveTenantId, useAuth } from "@/core/auth/authStore";
import { emitPlatformMetric } from "@/platform/observability/runtimeAnalytics";
import { buildTracePayload, newWorkflowTraceId } from "@/platform/observability/traceContext";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { runtimeModeController } from "@/platform/runtime/mode/runtimeModeController";
import { RuntimeMode, type ResolvedRuntimePolicy } from "@/platform/runtime/policy";
import type { WorkflowCheckpoint, WorkflowFailureClassification, WorkflowResumeStrategy } from "./types";
import { inMemoryWorkflowStore } from "./inMemoryWorkflowStore";
import { workflowRuntimeRegistry } from "./workflowRuntimeRegistry";

export type WorkflowStepContext = {
  workflowId: string;
  workflowTraceId: string;
  trace: ReturnType<typeof buildTracePayload>;
  policy: ResolvedRuntimePolicy;
};

export type WorkflowStep = {
  id: string;
  run: (ctx: WorkflowStepContext) => Promise<void>;
  compensate?: (ctx: WorkflowStepContext) => Promise<void>;
};

export type WorkflowStore = {
  get: (workflowId: string) => Promise<WorkflowCheckpoint | null>;
  put: (checkpoint: WorkflowCheckpoint) => Promise<void>;
  clear: (workflowId: string) => Promise<void>;
};

const WORKFLOW_BLOCKING_MODES = new Set<RuntimeMode>([
  RuntimeMode.READONLY,
  RuntimeMode.SAFE_MODE,
  RuntimeMode.INCIDENT,
]);

async function waitForRunnableRuntime(workflowId: string, policyTimeoutMs: number) {
  const cap = Math.min(60_000, Math.max(5_000, policyTimeoutMs * 5));
  const deadline = Date.now() + cap;
  while (Date.now() < deadline) {
    const mode = runtimeModeController.getSnapshot().effective.effectiveMode;
    if (!WORKFLOW_BLOCKING_MODES.has(mode)) return;
    emitPlatformMetric("workflow.runtime_mode_pause", { workflowId, mode });
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("workflow runtime mode blocked (timeout)");
}

function assertWorkflowEpochAndTenant(
  workflowId: string,
  workflowEpoch: number,
  traceTenantId: string | null | undefined,
) {
  if (runtimeEpochManager.getCurrentEpoch() !== workflowEpoch) {
    emitPlatformMetric("workflow.stale_epoch", { workflowId, workflowEpoch });
    throw new Error("Stale runtime epoch");
  }
  if (traceTenantId) {
    const effective = selectEffectiveTenantId(useAuth.getState());
    if (effective && effective !== traceTenantId) {
      emitPlatformMetric("workflow.tenant_mismatch", { workflowId });
      throw new Error("Tenant mismatch");
    }
  }
}

export function classifyWorkflowFailure(err: unknown): WorkflowFailureClassification {
  if (err instanceof Error) {
    if (err.message === "Stale runtime epoch") return "stale_epoch";
    if (err.message === "Tenant mismatch") return "tenant_mismatch";
    if (err.message.includes("runtime mode blocked")) return "policy_blocked";
  }
  return "unknown";
}

export function defaultResumeStrategy(_classification: WorkflowFailureClassification): WorkflowResumeStrategy {
  return "resume_from_checkpoint";
}

export function createWorkflow(input: {
  workflowId: string;
  workflowVersion: number;
  policy: ResolvedRuntimePolicy;
  steps: WorkflowStep[];
  store?: WorkflowStore;
  trace?: Partial<ReturnType<typeof buildTracePayload>>;
}) {
  const store = input.store ?? inMemoryWorkflowStore;
  const workflowTraceId = newWorkflowTraceId();
  const trace = buildTracePayload({ ...(input.trace ?? {}), workflowTraceId });

  async function checkpoint(stepIndex: number, workflowEpoch: number) {
    await store.put({
      workflowId: input.workflowId,
      workflowVersion: input.workflowVersion,
      workflowTraceId,
      stepIndex,
      updatedAt: new Date().toISOString(),
      trace,
      runtimeEpoch: workflowEpoch,
    });
  }

  async function run(): Promise<void> {
    const existing = await store.get(input.workflowId);
    let startAt = 0;
    let workflowEpoch = runtimeEpochManager.getCurrentEpoch();

    if (existing?.workflowVersion === input.workflowVersion) {
      const savedEpoch = existing.runtimeEpoch;
      if (savedEpoch !== undefined && runtimeEpochManager.getCurrentEpoch() !== savedEpoch) {
        await store.clear(input.workflowId);
        startAt = 0;
        workflowEpoch = runtimeEpochManager.getCurrentEpoch();
      } else {
        startAt = existing.stepIndex;
        workflowEpoch = savedEpoch ?? workflowEpoch;
      }
    }

    const ctx: WorkflowStepContext = {
      workflowId: input.workflowId,
      workflowTraceId,
      trace,
      policy: input.policy,
    };

    const completed: WorkflowStep[] = [];
    workflowRuntimeRegistry.register(input.workflowId);
    try {
      for (let i = startAt; i < input.steps.length; i++) {
        assertWorkflowEpochAndTenant(input.workflowId, workflowEpoch, trace.tenantId);
        await waitForRunnableRuntime(input.workflowId, input.policy.timeoutBudgetMs);
        await checkpoint(i, workflowEpoch);
        const step = input.steps[i]!;
        await step.run(ctx);
        completed.push(step);
      }
      await store.clear(input.workflowId);
    } catch (err) {
      const classification = classifyWorkflowFailure(err);
      const skipCompensate = classification === "stale_epoch" || classification === "tenant_mismatch";
      if (!skipCompensate) {
        emitPlatformMetric("workflow.compensation_triggered", {
          workflowId: input.workflowId,
          workflowTraceId,
        });
        for (const step of completed.reverse()) {
          if (!step.compensate) continue;
          try {
            await step.compensate(ctx);
          } catch {
            // Best-effort compensation; decision log persistence comes later.
          }
        }
      }
      throw err;
    } finally {
      workflowRuntimeRegistry.unregister(input.workflowId);
    }
  }

  return { run, workflowTraceId };
}
