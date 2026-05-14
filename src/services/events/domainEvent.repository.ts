import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

export type DomainEventRecord = {
  event_type: string;
  event_version: number;
  entity_type: string;
  entity_id: string | null;
  tenant_id: string;
  user_id?: string | null;
  payload: Record<string, unknown>;
  request_trace_id?: string | null;
  operation_trace_id?: string | null;
  workflow_trace_id?: string | null;
  runtime_transition_trace_id?: string | null;
  created_at?: string;
  processed_at?: string | null;
};

export const domainEventRepository = {
  async insert(event: DomainEventRecord) {
    const { error } = await supabase.from("domain_events").insert(event as any);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to persist domain event", {
        code: error.code,
        details: error,
      });
    }
  },
};
