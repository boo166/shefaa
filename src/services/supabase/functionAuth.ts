import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

export async function getSupabaseFunctionAuthHeaders(): Promise<Record<string, string>> {
  const { data: sessionData } = await supabase.auth.getSession();
  let accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    accessToken = refreshed.session?.access_token ?? undefined;
    if (refreshError && !accessToken) {
      throw new ServiceError(refreshError.message ?? "Authentication required", {
        code: refreshError.code,
        details: refreshError,
      });
    }
  }

  if (!accessToken) {
    throw new ServiceError("Authentication required", { code: "NOT_AUTHENTICATED" });
  }

  return { Authorization: `Bearer ${accessToken}` };
}
