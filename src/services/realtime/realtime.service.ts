import { subscribeEntity } from "@/platform/realtime/realtimeRuntime";
import { toServiceError } from "@/services/supabase/errors";
import type { RealtimePrincipalContext, RealtimeTable } from "./realtime.repository";

export const realtimeService = {
  subscribeToTenantTables(
    ctx: RealtimePrincipalContext,
    tables: RealtimeTable[],
    onChange: () => void,
  ) {
    try {
      return subscribeEntity({ ctx, tables, onEvent: onChange });
    } catch (err) {
      throw toServiceError(err, "Failed to subscribe to realtime updates");
    }
  },
};
