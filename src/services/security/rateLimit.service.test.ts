import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimitRepository } from "./rateLimit.repository";
import { rateLimitService } from "./rateLimit.service";

vi.mock("./rateLimit.repository", () => ({
  rateLimitRepository: {
    check: vi.fn(),
  },
}));

describe("rateLimitService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimitRepository.check).mockResolvedValue(true);
  });

  it("supports billing payment posting limits", async () => {
    await expect(
      rateLimitService.assertAllowed("invoice_payment_post", ["tenant-1", "user-1"]),
    ).resolves.toBeUndefined();

    expect(rateLimitRepository.check).toHaveBeenCalledWith(
      "invoice_payment_post:tenant-1:user-1",
      40,
      600,
    );
  });
});
