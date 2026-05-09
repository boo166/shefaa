import { describe, expect, it, vi } from "vitest";
import { RUNTIME_QUERY_SCOPE_MARKER } from "@/services/query/runtimeQueryConvergence";

describe("queryKeys runtime scope", () => {
  it("embeds rt epoch segment in tenant-scoped keys", async () => {
    vi.resetModules();
    const { runtimeEpochManager } = await import("@/platform/runtime/coordination/runtimeEpochManager");
    const { queryKeys } = await import("@/services/queryKeys");
    const epoch = runtimeEpochManager.getCurrentEpoch();
    const key = queryKeys.patients.root("tenant-a");
    expect(key[0]).toBe("patients");
    expect(key[1]).toBe(RUNTIME_QUERY_SCOPE_MARKER);
    expect(key[2]).toBe(epoch);
    expect(key[3]).toBe("tenant-a");
  });
});
