import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueJob, runJob } from "./job-runner";
import { jobService } from "@/services/jobs/job.service";
import { reportError } from "@/core/observability/logger";

vi.mock("@/services/jobs/job.service", () => ({
  jobService: {
    invoke: vi.fn(),
  },
}));

vi.mock("@/core/observability/logger", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  reportError: vi.fn(async () => undefined),
}));

const job = {
  name: "RefreshMaterializedViews" as const,
  maxRetries: 1,
  backoffMs: 2000,
  payload: { tenant_id: "tenant-1" },
};

describe("job runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets direct runJob callers handle enqueue failures", async () => {
    vi.mocked(jobService.invoke).mockRejectedValue(new Error("RLS denied"));

    await expect(runJob(job)).rejects.toThrow("RLS denied");
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action: "job_enqueue_failed",
        resourceType: "RefreshMaterializedViews",
      }),
    );
  });

  it("does not leak fire-and-forget enqueue failures as unhandled promises", async () => {
    vi.mocked(jobService.invoke).mockRejectedValue(new Error("RLS denied"));

    expect(enqueueJob(job)).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action: "job_enqueue_failed",
        resourceType: "RefreshMaterializedViews",
      }),
    );
  });
});
