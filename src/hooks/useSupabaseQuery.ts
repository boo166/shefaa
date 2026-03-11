import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/authStore";

type TableName = "patients" | "appointments" | "doctors" | "invoices" | "medications" | "lab_orders" | "insurance_claims" | "prescriptions" | "medical_records";

type Filter = {
  column: string;
  operator?: "eq";
  value: string | number | boolean | null;
};

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

export function useSupabaseTablePaged<T = unknown>(
  table: TableName,
  options?: {
    select?: string;
    enabled?: boolean;
    orderBy?: { column: string; ascending?: boolean };
    page?: number;
    pageSize?: number;
    filters?: Filter[];
    search?: { term: string; columns: string[] };
  }
) {
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const select = options?.select ?? "*";
  const orderColumn = options?.orderBy?.column ?? null;
  const orderAscending = options?.orderBy?.ascending ?? false;
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const filters = options?.filters ?? [];
  const search = options?.search;
  const searchTerm = search?.term?.trim() ?? "";
  const searchCols = search?.columns ?? [];
  const filtersKey = filters
    .map((f) => `${f.column}:${f.operator ?? "eq"}:${String(f.value)}`)
    .join("|");
  const searchKey = searchTerm ? `${searchTerm}:${searchCols.join(",")}` : "";

  const query = useQuery<{ data: T[]; count: number }>({
    queryKey: [table, tenantId, select, orderColumn, orderAscending, page, pageSize, filtersKey, searchKey],
    queryFn: async () => {
      let dbQuery = supabase
        .from(table)
        .select(select, { count: "exact" });

      if (tenantId && tenantId !== "demo") {
        dbQuery = dbQuery.eq("tenant_id", tenantId);
      }

      for (const filter of filters) {
        const value = filter.value;
        if (value === undefined || value === null || value === "") continue;
        if ((filter.operator ?? "eq") === "eq") {
          dbQuery = dbQuery.eq(filter.column, value as any);
        }
      }

      if (searchTerm && searchCols.length > 0) {
        const escaped = searchTerm.replace(/[%_]/g, "\\$&").replace(/,/g, "\\,");
        const orFilter = searchCols
          .map((col) => `${col}.ilike.%${escaped}%`)
          .join(",");
        dbQuery = dbQuery.or(orFilter);
      }

      if (orderColumn) {
        dbQuery = dbQuery.order(orderColumn, { ascending: orderAscending });
      }

      dbQuery = dbQuery.range(from, to);

      const { data, error, count } = await dbQuery;
      if (error) throw error;
      return { data: (data ?? []) as T[], count: count ?? 0 };
    },
    enabled: (options?.enabled ?? true) && !!tenantId && tenantId !== "demo",
  });

  return {
    ...query,
    data: query.data?.data ?? [],
    count: query.data?.count ?? 0,
  };
}
