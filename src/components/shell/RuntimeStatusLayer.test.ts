import { describe, expect, it } from "vitest";
import { runtimeEpochManager } from "@/platform/runtime/coordination/runtimeEpochManager";
import { getRuntimeTopologySnapshot } from "./RuntimeStatusLayer";

describe("RuntimeStatusLayer topology snapshot", () => {
  it("returns a stable reference while runtime topology is unchanged", () => {
    const first = getRuntimeTopologySnapshot();
    const second = getRuntimeTopologySnapshot();

    expect(second).toBe(first);
  });

  it("returns a new reference when runtime topology changes", () => {
    const first = getRuntimeTopologySnapshot();
    runtimeEpochManager.bump("manual");
    const second = getRuntimeTopologySnapshot();

    expect(second).not.toBe(first);
    expect(second.epoch).toBe(first.epoch + 1);
  });
});
