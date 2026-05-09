import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEventDedupForTests } from "../eventDedup";

vi.mock("@/core/auth/authStore", () => ({
  useAuth: {
    getState: () => ({
      user: {
        id: "chaos-test-user",
        tenantId: "chaos-test-tenant",
        globalRoles: [] as string[],
        tenantRoles: [] as string[],
        tenantStatus: "active" as const,
      },
    }),
  },
}));

describe("chaos runtime matrix (deterministic guards)", () => {
  beforeEach(() => {
    resetEventDedupForTests();
  });

  afterEach(() => {
    resetEventDedupForTests();
  });

  it("rejects duplicate coordination event ids", async () => {
    const { runtimeEventBus } = await import("../runtimeEventBus");
    const id = "dup-event-1";
    const a = runtimeEventBus.publish({
      type: "RUNTIME_EPOCH_BUMPED",
      traceId: "t1",
      eventId: id,
      payload: {},
    });
    const b = runtimeEventBus.publish({
      type: "RUNTIME_EPOCH_BUMPED",
      traceId: "t2",
      eventId: id,
      payload: {},
    });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });

  it("rejects stale runtime mode version events", async () => {
    const { runtimeEventBus } = await import("../runtimeEventBus");
    const { runtimeModeController } = await import("@/platform/runtime/mode/runtimeModeController");
    const cur = runtimeModeController.getSnapshot().effective.version;
    const evt = runtimeEventBus.publish({
      type: "RUNTIME_MODE_CHANGED",
      traceId: "t-mode",
      payload: { runtimeModeVersion: cur - 1, from: "NORMAL", to: "READONLY" },
    });
    expect(evt).toBeNull();
  });
});
