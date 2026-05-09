import { describe, expect, it, vi } from "vitest";

describe("runtimeEpochManager", () => {
  it("bumps monotonically and validates matching epochs", async () => {
    vi.resetModules();
    const { runtimeEpochManager } = await import("../runtimeEpochManager");
    const start = runtimeEpochManager.getCurrentEpoch();
    const next = runtimeEpochManager.bump("auth_boundary");
    expect(next).toBe(start + 1);
    expect(runtimeEpochManager.validateOperationEpoch(start).ok).toBe(false);
    expect(runtimeEpochManager.validateOperationEpoch(next).ok).toBe(true);
  });

  it("adoptIfNewer only increases epoch", async () => {
    vi.resetModules();
    const { runtimeEpochManager } = await import("../runtimeEpochManager");
    const start = runtimeEpochManager.getCurrentEpoch();
    expect(runtimeEpochManager.adoptIfNewer(start - 1)).toBe(start);
    expect(runtimeEpochManager.adoptIfNewer(start + 10)).toBe(start + 10);
  });
});

describe("consistencyBarrier", () => {
  it("wait resolves when barrier clears", async () => {
    vi.resetModules();
    const { consistencyBarrier } = await import("../consistencyBarrier");
    consistencyBarrier.enter("t1");
    const p = consistencyBarrier.wait("t1", 5_000);
    consistencyBarrier.leave("t1");
    await expect(p).resolves.toBeUndefined();
  });

  it("wait alias matches waitUntilClear", async () => {
    vi.resetModules();
    const { consistencyBarrier } = await import("../consistencyBarrier");
    await expect(consistencyBarrier.wait("empty", 100)).resolves.toBeUndefined();
  });
});
