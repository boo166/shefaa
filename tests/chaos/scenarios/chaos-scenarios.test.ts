import { describe, expect, it } from "vitest";
import { withLatency } from "../injectors/latency";

describe("chaos injectors (operational scenarios)", () => {
  it("withLatency delays execution", async () => {
    const order: string[] = [];
    await withLatency(15, async () => {
      order.push("inner");
    });
    order.push("after");
    expect(order).toEqual(["inner", "after"]);
  });
});
