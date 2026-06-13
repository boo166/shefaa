import { describe, expect, it, vi, beforeEach } from "vitest";
import { identityAuditService } from "@/services/auth/identityAudit.service";

const logEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/services/auth/identityAudit.repository", () => ({
  identityAuditRepository: {
    logEvent: (...args: unknown[]) => logEvent(...args),
  },
}));

describe("identityAuditService", () => {
  beforeEach(() => {
    logEvent.mockClear();
  });

  it("sanitizes LOGIN_FAILED details to email domain only", async () => {
    await identityAuditService.logEvent({
      action: "LOGIN_FAILED",
      details: { email: "doctor@clinic.example" },
    });

    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "LOGIN_FAILED",
        details: { outcome: "failed", email_domain: "clinic.example" },
      }),
    );
  });

  it("logEventFireAndForget does not throw when repository fails", async () => {
    logEvent.mockRejectedValueOnce(new Error("network"));
    expect(() => {
      identityAuditService.logEventFireAndForget({ action: "LOGOUT", userId: "u1" });
    }).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
  });
});
