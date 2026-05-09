import { describe, expect, it, vi } from "vitest";
import { classifyWorkflowFailure, createWorkflow } from "../createWorkflow";

const epochState = vi.hoisted(() => ({ v: 7 }));

vi.mock("@/platform/runtime/coordination/runtimeEpochManager", () => ({
  runtimeEpochManager: {
    getCurrentEpoch: () => epochState.v,
    bump: () => {
      epochState.v += 1;
      return epochState.v;
    },
    subscribe: () => () => {},
    adoptIfNewer: (n: number) => {
      if (n > epochState.v) epochState.v = n;
      return epochState.v;
    },
    initCrossTabSync: () => {},
    validateOperationEpoch: (op?: number) =>
      op === undefined || op === epochState.v ? { ok: true as const } : { ok: false as const, current: epochState.v },
  },
}));

vi.mock("@/platform/runtime/mode/runtimeModeController", () => ({
  runtimeModeController: {
    getSnapshot: () => ({
      effective: { effectiveMode: "NORMAL", version: 0 },
    }),
    subscribe: () => () => {},
  },
}));

vi.mock("@/core/auth/authStore", async () => {
  const actual = await vi.importActual<typeof import("@/core/auth/authStore")>("@/core/auth/authStore");
  return {
    ...actual,
    selectEffectiveTenantId: () => "tenant-a",
  };
});

const policy = {
  decisionId: "d1",
  decisionReasons: [] as const,
  writeAllowed: true,
  retryPolicy: { maxRetries: 0, retryDelayMs: 0 },
  timeoutBudgetMs: 1000,
  replayPolicy: "accept" as const,
  telemetrySeverity: "info" as const,
  invariantLevel: "basic" as const,
  degradationStrategy: "normal" as const,
  cachePolicy: "normal" as const,
  auditLevel: "none" as const,
};

describe("createWorkflow coordination", () => {
  it("aborts before a later step when epoch advances mid-run", async () => {
    epochState.v = 7;
    const step1 = {
      id: "s1",
      run: vi.fn(async () => {
        epochState.v = 8;
      }),
    };
    const step2 = { id: "s2", run: vi.fn(async () => {}) };

    const wf = createWorkflow({
      workflowId: "wf-coord",
      workflowVersion: 1,
      policy,
      steps: [step1, step2],
      trace: { tenantId: "tenant-a" },
    });

    await expect(wf.run()).rejects.toThrow("Stale runtime epoch");
    expect(step1.run).toHaveBeenCalledTimes(1);
    expect(step2.run).not.toHaveBeenCalled();
  });
});

describe("classifyWorkflowFailure", () => {
  it("maps known errors", () => {
    expect(classifyWorkflowFailure(new Error("Stale runtime epoch"))).toBe("stale_epoch");
    expect(classifyWorkflowFailure(new Error("Tenant mismatch"))).toBe("tenant_mismatch");
    expect(classifyWorkflowFailure(new Error("workflow runtime mode blocked (timeout)"))).toBe("policy_blocked");
  });
});
