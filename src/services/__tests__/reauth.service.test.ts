import { beforeEach, describe, expect, it, vi } from "vitest";

const signInWithPassword = vi.hoisted(() => vi.fn());
const getState = vi.hoisted(() => vi.fn());
const markSessionVerified = vi.hoisted(() => vi.fn());

vi.mock("@/services/auth/auth.repository", () => ({
  authRepository: {
    signInWithPassword,
  },
}));

vi.mock("@/services/auth/auth.service", () => ({
  authListenerGuards: {
    suppressSignedOutCleanup: false,
    suppressMfaRequiredDuringReauth: false,
  },
}));

vi.mock("@/core/auth/authStore", () => ({
  useAuth: { getState },
}));

import { reauthService } from "@/services/auth/reauth.service";

describe("reauthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getState.mockReturnValue({
      user: {
        id: "user-1",
        email: "user@example.com",
      },
      markSessionVerified,
    });
  });

  it("re-verifies the active user and refreshes session freshness", async () => {
    signInWithPassword.mockResolvedValue({ id: "user-1" });

    await reauthService.reauthenticate("password123");

    expect(signInWithPassword).toHaveBeenCalledWith("user@example.com", "password123");
    expect(markSessionVerified).toHaveBeenCalledTimes(1);
  });

  it("rejects when the verified user does not match the active session", async () => {
    signInWithPassword.mockResolvedValue({ id: "user-2" });

    await expect(reauthService.reauthenticate("password123")).rejects.toThrow(/verify your session/i);
    expect(markSessionVerified).not.toHaveBeenCalled();
  });
});
