import type { RecoveryClass, RecoveryFailureKind } from "@/platform/runtime/semantics/runtimeSemanticTypes";
import type { RuntimeHealth } from "@/platform/runtime/recovery/runtimeHealthStore";
import type { RuntimeMode } from "@/platform/runtime/policy";
import { supabase } from "@/services/supabase/client";

export type RuntimeIncidentSeverity = "info" | "warning" | "critical";
export type RuntimeRecoveryActionStatus = "started" | "completed" | "failed" | "operator_required";

export type RuntimeIncidentTimelineInsert = {
  tenant_id: string | null;
  actor_id: string | null;
  incident_type: RecoveryFailureKind;
  runtime_health: RuntimeHealth;
  runtime_mode: RuntimeMode;
  severity: RuntimeIncidentSeverity;
  trace_ids: Record<string, string | null>;
  metadata: Record<string, string | number | boolean | null>;
  detected_at: string;
};

export type RuntimeIncidentTimelineRow = RuntimeIncidentTimelineInsert & {
  id: string;
  created_at: string;
};

export type RuntimeRecoveryActionInsert = {
  incident_id: string;
  tenant_id: string | null;
  actor_id: string | null;
  recovery_class: RecoveryClass;
  action_status: RuntimeRecoveryActionStatus;
  triggered_by: "automatic" | "operator";
  trace_ids: Record<string, string | null>;
  action_metadata: Record<string, string | number | boolean | null>;
  started_at: string;
  completed_at?: string | null;
};

export type RuntimeRecoveryActionRow = RuntimeRecoveryActionInsert & {
  id: string;
  created_at: string;
};

type RuntimeIncidentLedgerInput = {
  incident: RuntimeIncidentTimelineInsert;
  actions: Omit<RuntimeRecoveryActionInsert, "incident_id">[];
};

const INCIDENT_COLUMNS = "id, tenant_id, actor_id, incident_type, runtime_health, runtime_mode, severity, trace_ids, metadata, detected_at, created_at";
const ACTION_COLUMNS = "id, incident_id, tenant_id, actor_id, recovery_class, action_status, triggered_by, trace_ids, action_metadata, started_at, completed_at, created_at";

/** Best-effort forensic persistence. Recovery must not depend on network/RLS availability. */
export async function persistRuntimeIncidentLedger(input: RuntimeIncidentLedgerInput): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { data, error } = await supabase
      .from("runtime_incident_timeline")
      .insert(input.incident as never)
      .select("id")
      .single();
    if (error || !data?.id) {
      if (error) console.warn("[runtime_incident_timeline]", error.message);
      return;
    }

    if (input.actions.length === 0) return;
    const actions = input.actions.map((action) => ({
      ...action,
      incident_id: data.id,
    }));
    const { error: actionError } = await supabase
      .from("runtime_recovery_actions")
      .insert(actions as never);
    if (actionError) console.warn("[runtime_recovery_actions]", actionError.message);
  } catch {
    /* ignore */
  }
}

export async function listRecentRuntimeIncidents(limit = 8): Promise<RuntimeIncidentTimelineRow[]> {
  if (typeof window === "undefined") return [];
  const { data, error } = await supabase
    .from("runtime_incident_timeline")
    .select(INCIDENT_COLUMNS)
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[runtime_incident_timeline]", error.message);
    return [];
  }
  return (data ?? []) as RuntimeIncidentTimelineRow[];
}

export async function listRecentRuntimeRecoveryActions(limit = 12): Promise<RuntimeRecoveryActionRow[]> {
  if (typeof window === "undefined") return [];
  const { data, error } = await supabase
    .from("runtime_recovery_actions")
    .select(ACTION_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[runtime_recovery_actions]", error.message);
    return [];
  }
  return (data ?? []) as RuntimeRecoveryActionRow[];
}
