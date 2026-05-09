import { describe, expect, it, vi } from "vitest";
import { createAsyncOperation } from "../createAsyncOperation";
import { ServiceError } from "@/services/supabase/errors";

describe("createAsyncOperation", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue(42);
    const r = await createAsyncOperation("test.op", fn, { maxRetries: 0 });
    expect(r).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient ServiceError then succeeds", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n++;
      if (n === 1) throw new ServiceError("network failure", { code: "network" });
      return "ok";
    });
    const r = await createAsyncOperation("test.op", fn, {
      maxRetries: 2,
      retryDelayMs: 1,
      shouldRetry: () => true,
    });
    expect(r).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
