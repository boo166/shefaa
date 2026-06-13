import { z } from "zod";
import { useAuth } from "@/core/auth/authStore";
import { authListenerGuards } from "./auth.service";
import { authRepository } from "./auth.repository";
import { AuthorizationError, toServiceError } from "@/services/supabase/errors";

const passwordSchema = z.string().min(1, "Password is required");

export const reauthService = {
  async reauthenticate(password: string) {
    try {
      const parsedPassword = passwordSchema.parse(password);
      const { user, markSessionVerified } = useAuth.getState();

      if (!user?.email || !user.id) {
        throw new AuthorizationError("Unable to verify your session. Please sign in again.");
      }

      authListenerGuards.suppressMfaRequiredDuringReauth = true;
      let verifiedUser: Awaited<ReturnType<typeof authRepository.signInWithPassword>>;
      try {
        verifiedUser = await authRepository.signInWithPassword(user.email, parsedPassword);
      } finally {
        authListenerGuards.suppressMfaRequiredDuringReauth = false;
      }

      if (!verifiedUser || verifiedUser.id !== user.id) {
        throw new AuthorizationError("Unable to verify your session. Please sign in again.");
      }

      markSessionVerified();
      await authRepository.refreshSessionSingleFlight();
    } catch (err) {
      throw toServiceError(err, "Re-authentication failed");
    }
  },
};
