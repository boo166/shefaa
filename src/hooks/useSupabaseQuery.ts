import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/authStore";

type TableName = "patients" | "appointments" | "doctors" | "invoices" | "medications" | "lab_orders" | "insurance_claims" | "prescriptions" | "medical_records";

export function useSupabaseTable<T = unknown>(
  table: TableName,
  options?: {
    select?: string;
    enabled?: boolean;
    orderBy?: { column: string; ascending?: boolean };
  }
) {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const select = options?.select ?? "*";
  const orderColumn = options?.orderBy?.column ?? null;
  const orderAscending = options?.orderBy?.ascending ?? false;

  return useQuery<T[]>({
    queryKey: [table, tenantId, select, orderColumn, orderAscending],
    queryFn: async () => {
      let query = supabase
        .from(table)
        .select(select);

      // Only filter by tenant for real (non-demo) users
      if (tenantId && tenantId !== "demo") {
        query = query.eq("tenant_id", tenantId);
      }

      if (orderColumn) {
        query = query.order(orderColumn, { ascending: orderAscending });
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as T[];
    },
    enabled: (options?.enabled ?? true) && !!tenantId && tenantId !== "demo",
  });
}
