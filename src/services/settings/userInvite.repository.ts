import type { InviteStaffInput } from "@/domain/settings/invite.types";
import { env } from "@/core/env/env";
import { supabase } from "@/services/supabase/client";
import { AuthorizationError, ServiceError } from "@/services/supabase/errors";

function extractFunctionErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const message = (data as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export interface UserInviteRepository {
  inviteStaff(input: InviteStaffInput & { stepUpGrantId: string }): Promise<void>;
}

export const userInviteRepository: UserInviteRepository = {
  async inviteStaff(input) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new AuthorizationError("Your session expired. Please sign in again.", {
        code: "NOT_AUTHENTICATED",
      });
    }

    // Native fetch avoids supabaseAuthFetch retry side-effects during privileged step-up.
    const response = await globalThis.fetch(`${env.VITE_SUPABASE_URL}/functions/v1/invite-staff`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    let data: unknown = null;
    const contentType = response.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => "");
      data = text ? { error: text } : null;
    }

    const bodyMessage = extractFunctionErrorMessage(data, "");

    if (!response.ok || bodyMessage) {
      const message = bodyMessage || `Failed to invite staff (${response.status})`;
      const normalized = message.toLowerCase();

      if (!response.ok && (response.type === "opaque" || response.status === 0)) {
        throw new ServiceError(
          "Could not reach the invite service. Clear your browser cache and try again.",
          { code: "INVITE_NETWORK_ERROR", status: response.status, details: data },
        );
      }

      if (response.status === 403 && (normalized.includes("mfa") || normalized.includes("step-up"))) {
        throw new AuthorizationError(message, { code: "MFA_REQUIRED" });
      }
      if (response.status === 401 || normalized.includes("unauthorized")) {
        throw new AuthorizationError(
          "Unable to verify your session for this action. Complete MFA step-up and try again.",
          { code: "MFA_REQUIRED" },
        );
      }

      throw new ServiceError(message, {
        code: String(response.status || "INVITE_FAILED"),
        status: response.status,
        details: data,
      });
    }
  },
};
