import { supabase } from "@/services/supabase/client";

export type RealtimeTable =
  | "patients"
  | "appointments"
  | "appointment_queue"
  | "doctors"
  | "invoices"
  | "medications"
  | "lab_orders"
  | "insurance_claims";

export type RealtimePrincipalContext = {
  tenantId: string;
  /** Binds channel to auth session generation; must change on logout / tenant switch / role refresh. */
  sessionVersion: string | null;
  userId: string;
};

export interface RealtimeRepository {
  subscribeToTenantTables(
    ctx: RealtimePrincipalContext,
    tables: RealtimeTable[],
    onChange: () => void,
  ): { unsubscribe: () => void };
}

export const realtimeRepository: RealtimeRepository = {
  subscribeToTenantTables(ctx, tables, onChange) {
    const { tenantId, sessionVersion, userId } = ctx;
    const tablesKey = [...new Set(tables)].sort().join("|");
    const principalKey = sessionVersion ?? `u:${userId}`;
    const channel = supabase.channel(`realtime:${tenantId}:${principalKey}:${tablesKey}`);

    for (const table of tables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `tenant_id=eq.${tenantId}`,
        },
        onChange,
      );
    }

    channel.subscribe();

    return {
      unsubscribe: () => {
        supabase.removeChannel(channel);
      },
    };
  },
};
