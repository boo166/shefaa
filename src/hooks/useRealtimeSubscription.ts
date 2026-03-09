import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/authStore";

type RealtimeTable = "patients" | "appointments" | "doctors" | "invoices" | "medications" | "lab_orders" | "insurance_claims";

export function useRealtimeSubscription(tables: RealtimeTable[]) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const tablesKey = [...new Set(tables)].sort().join("|");

  useEffect(() => {
    if (!tenantId || tenantId === "demo") return;

    const watchedTables = tablesKey.split("|").filter(Boolean) as RealtimeTable[];
    if (watchedTables.length === 0) return;

    const channel = supabase
      .channel(`realtime:${tenantId}:${tablesKey}`);

    for (const table of watchedTables) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: [table, tenantId] });
        },
      );
    }

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, tablesKey, queryClient]);
}
