import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { ServiceError } from "@/services/supabase/errors";

export type EventOutboxSummary = {
  backlog_count: number;
  processing_count: number;
  retry_count: number;
  failed_count: number;
  delivered_count: number;
  dead_letter_count: number;
  oldest_undelivered_at: string | null;
  oldest_undelivered_age_seconds: number;
  avg_delivery_latency_ms: number | null;
};

export type EventOutboxRow = {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string | null;
  handler_name: string;
  delivery_guarantee: "at_least_once" | "exactly_once_persistence" | "best_effort" | "eventually_consistent";
  status: "PENDING" | "PROCESSING" | "RETRY" | "FAILED" | "DELIVERED" | "DEAD_LETTER";
  attempts: number;
  max_attempts: number;
  next_retry_at: string;
  processed_at: string | null;
  last_error: string | null;
  last_error_code?: string | null;
  request_trace_id: string | null;
  operation_trace_id: string | null;
  workflow_trace_id: string | null;
  causal_parent_id?: string | null;
  failure_kind?: string | null;
  runtime_effect?: string | null;
  replay_safe?: boolean | null;
  requires_reconciliation?: boolean | null;
  requires_operator?: boolean | null;
  evidence_metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function outboxCtx(action: string, tenantId?: string | null): PlatformRepositoryContext {
  return {
    action,
    classification: action.endsWith(".replay") ? "critical" : "readonly",
    tenantScoped: Boolean(tenantId),
    tenantId: tenantId ?? null,
    subsystem: "jobs",
  };
}

export const eventOutboxRepository = {
  async getSummary(tenantId?: string | null): Promise<EventOutboxSummary> {
    const { data, error } = await platformRepository.rpc("admin_event_outbox_summary", {
      _tenant_id: tenantId ?? null,
    }, outboxCtx("events.outbox.summary", tenantId));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load event outbox summary", {
        code: error.code,
        details: error,
      });
    }
    return ((data as EventOutboxSummary[] | null)?.[0] ?? {
      backlog_count: 0,
      processing_count: 0,
      retry_count: 0,
      failed_count: 0,
      delivered_count: 0,
      dead_letter_count: 0,
      oldest_undelivered_at: null,
      oldest_undelivered_age_seconds: 0,
      avg_delivery_latency_ms: null,
    }) as EventOutboxSummary;
  },

  async listRecent(limit = 20, tenantId?: string | null): Promise<EventOutboxRow[]> {
    const { data, error } = await platformRepository.rpc("admin_recent_event_outbox", {
      _limit: limit,
      _tenant_id: tenantId ?? null,
    }, outboxCtx("events.outbox.listRecent", tenantId));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load event outbox rows", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as EventOutboxRow[];
  },

  async replay(ids: string[]): Promise<EventOutboxRow[]> {
    if (ids.length === 0) return [];
    const { data, error } = await platformRepository.rpc("admin_replay_event_outbox", {
      _event_ids: ids,
    }, outboxCtx("events.outbox.replay"));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to replay event outbox rows", {
        code: error.code,
        details: error,
      });
    }
    return (data ?? []) as EventOutboxRow[];
  },

  describe() {
    return {
      certified: false,
      tenantBound: false,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: false,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [],
      exceptions: [
        "Operator outbox reads can run globally for platform admins and do not yet declare capability metadata.",
      ],
    };
  },
};
