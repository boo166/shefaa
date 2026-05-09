import { describe, expect, it, vi } from "vitest";
import { createWorkflow } from "../createWorkflow";

describe("createWorkflow", () => {
  it("runs steps and compensates completed steps on failure", async () => {
    const calls: string[] = [];
    const step1 = {
      id: "s1",
      run: vi.fn(async () => {
        calls.push("run1");
      }),
      compensate: vi.fn(async () => {
        calls.push("comp1");
      }),
    };
    const step2 = {
      id: "s2",
      run: vi.fn(async () => {
        calls.push("run2");
        throw new Error("boom");
      }),
      compensate: vi.fn(async () => {
        calls.push("comp2");
      }),
    };

    const wf = createWorkflow({
      workflowId: "wf-1",
      workflowVersion: 1,
      policy: {
        decisionId: "d1",
        decisionReasons: [],
        writeAllowed: true,
        retryPolicy: { maxRetries: 0, retryDelayMs: 0 },
        timeoutBudgetMs: 1000,
        replayPolicy: "accept",
        telemetrySeverity: "info",
        invariantLevel: "basic",
        degradationStrategy: "normal",
        cachePolicy: "normal",
        auditLevel: "none",
      },
      steps: [step1, step2],
    });

    await expect(wf.run()).rejects.toThrow("boom");
    expect(calls).toEqual(["run1", "run2", "comp1"]);
  });
});

