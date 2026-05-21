import { supabase } from "@/services/supabase/client";

export type RuntimeTransitionLogInsert = {
  transition_id: string;
  runtime_epoch: number;
  transition_type: string;
  tenant_id: string | null;
  actor_id: string | null;
  started_at: string;
  completed_at?: string | null;
  failed_at?: string | null;
  rollback_triggered: boolean;
  trace_id: string | null;
  runtime_transition_trace_id: string | null;
  causal_parent_id?: string | null;
  failure_kind?: string | null;
  runtime_effect?: string | null;
  recovery_contract?: Record<string, unknown> | null;
  evidence_metadata?: Record<string, unknown> | null;
  status: string;
};

export type RuntimeTransitionLogRow = RuntimeTransitionLogInsert & {
  id: string;
  created_at: string;
};

/** Best-effort persistence; ignores failures (offline, RLS, missing table in local DB). */
export async function persistRuntimeTransitionLogRow(row: RuntimeTransitionLogInsert): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const sb = supabase as unknown as {
      from: (name: string) => { insert: (r: RuntimeTransitionLogInsert) => Promise<{ error: { message: string } | null }> };
    };
    const { error } = await sb.from("runtime_transition_log").insert(row);
    if (error) console.warn("[runtime_transition_log]", error.message);
  } catch {
    /* ignore */
  }
}

export async function listRecentRuntimeTransitionLogRows(limit = 6): Promise<RuntimeTransitionLogRow[]> {
  if (typeof window === "undefined") return [];
  const sb = supabase as unknown as {
    from: (name: string) => {
      select: (columns: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => {
          limit: (count: number) => Promise<{
            data: RuntimeTransitionLogRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  const { data, error } = await sb
    .from("runtime_transition_log")
    .select("id, transition_id, runtime_epoch, transition_type, tenant_id, actor_id, started_at, completed_at, failed_at, rollback_triggered, trace_id, runtime_transition_trace_id, causal_parent_id, failure_kind, runtime_effect, recovery_contract, evidence_metadata, status, created_at")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[runtime_transition_log]", error.message);
    return [];
  }
  return data ?? [];
}
