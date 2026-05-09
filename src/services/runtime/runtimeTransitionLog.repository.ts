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
  status: string;
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
