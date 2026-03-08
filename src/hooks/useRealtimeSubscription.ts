import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/authStore";

type RealtimeTable = "patients" | "appointments" | "doctors" | "invoices" | "medications" | "lab_orders" | "insurance_claims";

export function useRealtimeSubscription(tables: RealtimeTable[]) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  useEffect(() => {
    if (!tenantId || tenantId === "demo") return;

    const channel = supabase
      .channel("realtime-tables")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        (payload) => {
          const table = payload.table as RealtimeTable;
          if (tables.includes(table)) {
            queryClient.invalidateQueries({ queryKey: [table, tenantId] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, tables, queryClient]);
}
