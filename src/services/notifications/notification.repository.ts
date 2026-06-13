import type { Notification, NotificationCreateInput } from "@/domain/notifications/notification.types";
import { Capabilities } from "@/platform/authorization/capabilities";
import { platformRepository } from "@/platform/data/platformRepository";
import { platform } from "@/platform/sdk";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { commandTraceParams } from "@/services/operational/commandTrace";
import { ServiceError } from "@/services/supabase/errors";

const NOTIFICATION_COLUMNS =
  "id, tenant_id, user_id, title, body, type, read, created_at, delivery_key, source_event_id, source_outbox_id, delivered_at, acknowledged_at, updated_at";

const NOTIFICATION_COLUMNS_LEGACY =
  "id, tenant_id, user_id, title, body, type, read, created_at";

const NOTIFICATION_COLUMN_SET_KEY = "shefaa:notifications:list-column-set";

type NotificationListColumnSet = "extended" | "legacy";

let notificationListColumnSet: NotificationListColumnSet | null = readCachedNotificationColumnSet();

function readCachedNotificationColumnSet(): NotificationListColumnSet | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const value = sessionStorage.getItem(NOTIFICATION_COLUMN_SET_KEY);
    return value === "extended" || value === "legacy" ? value : null;
  } catch {
    return null;
  }
}

function cacheNotificationColumnSet(set: NotificationListColumnSet) {
  notificationListColumnSet = set;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(NOTIFICATION_COLUMN_SET_KEY, set);
  } catch {
    /* ignore */
  }
}

function notificationListColumns(): string {
  return notificationListColumnSet === "legacy"
    ? NOTIFICATION_COLUMNS_LEGACY
    : NOTIFICATION_COLUMNS;
}

function isMissingNotificationColumnError(error: {
  message?: string | null;
  code?: string | number | null;
  details?: string | null;
  hint?: string | null;
}) {
  const code = error.code != null ? String(error.code) : "";
  const combined = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return code === "42703"
    || code === "PGRST204"
    || combined.includes("delivery_key")
    || combined.includes("could not find")
    || (combined.includes("column") && combined.includes("does not exist"));
}

/** Test hook: reset cached notification list column resolution. */
export function resetNotificationListColumnSetForTests() {
  notificationListColumnSet = null;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(NOTIFICATION_COLUMN_SET_KEY);
  } catch {
    /* ignore */
  }
}

const NOTIFICATION_READ_CAPS = [Capabilities.notifications.read] as const;
const NOTIFICATION_WRITE_CAPS = [Capabilities.notifications.write] as const;

function notificationCtx(
  tenantId: string | null,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
  requiredCapabilities: string[] = [],
  trace?: PlatformRepositoryContext["trace"],
): PlatformRepositoryContext {
  return {
    action,
    classification,
    tenantScoped: Boolean(tenantId),
    tenantId,
    subsystem: "notifications",
    requiredCapabilities,
    trace,
  };
}

export type NotificationCommandResult = {
  result_code: string;
  retryable: boolean;
  idempotency_replay: boolean;
  message: string | null;
  notification: Notification | null;
};

export type NotificationDeliveryAuditRow = {
  id: string;
  tenant_id: string | null;
  action: string;
  created_at: string;
  details: Record<string, string | null | undefined> | null;
};

export interface NotificationRepository {
  listByUserPaged(tenantId: string, userId: string, limit: number, offset: number): Promise<{ data: Notification[]; count: number }>;
  markRead(id: string, tenantId: string, userId: string): Promise<void>;
  markManyRead(ids: string[], tenantId: string, userId: string): Promise<void>;
  create(input: NotificationCreateInput): Promise<Notification>;
  commandDelivery(input: {
    tenantId: string;
    userId: string;
    title: string;
    body?: string | null;
    type: string;
    read?: boolean;
    deliveryKey: string;
    sourceEventId?: string | null;
    sourceOutboxId?: string | null;
    idempotencyKey?: string | null;
    requestHash?: string | null;
    actorUserId?: string | null;
    trace?: PlatformRepositoryContext["trace"];
  }): Promise<NotificationCommandResult>;
  commandAcknowledge(input: {
    notificationId: string;
    tenantId: string;
    userId: string;
    expectedUpdatedAt?: string | null;
    idempotencyKey?: string | null;
    requestHash?: string | null;
    actorUserId?: string | null;
    trace?: PlatformRepositoryContext["trace"];
  }): Promise<NotificationCommandResult>;
  subscribeToUser(
    tenantId: string,
    userId: string,
    onInsert: (payload: Notification) => void,
  ): { unsubscribe: () => void };
  listRecentDeliveryAuditEvidence(tenantId: string, limit?: number): Promise<NotificationDeliveryAuditRow[]>;
  listDeliveryAuditByWorkflowTraceId(tenantId: string, workflowTraceId: string, limit?: number): Promise<NotificationDeliveryAuditRow[]>;
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    traceAware: boolean;
    runtimeAware: boolean;
    capabilityAware: boolean;
    reconciliationAware: boolean;
    recoveryAware: boolean;
    evidenceAware: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
    exceptions?: string[];
  };
}

export const notificationRepository: NotificationRepository = {
  async listByUserPaged(tenantId, userId, limit, offset) {
    const to = Math.max(0, offset + limit - 1);
    const ctx = notificationCtx(tenantId, "notifications.listByUserPaged", "readonly", [...NOTIFICATION_READ_CAPS]);
    const buildQuery = (columns: string) => platformRepository
      .from("notifications", ctx)
      .select(columns, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, to);

    let columns = notificationListColumns();
    let { data, error, count } = await buildQuery(columns);

    if (
      error
      && notificationListColumnSet === null
      && columns === NOTIFICATION_COLUMNS
      && isMissingNotificationColumnError(error)
    ) {
      cacheNotificationColumnSet("legacy");
      columns = NOTIFICATION_COLUMNS_LEGACY;
      ({ data, error, count } = await buildQuery(columns));
    } else if (!error) {
      cacheNotificationColumnSet(columns === NOTIFICATION_COLUMNS ? "extended" : "legacy");
    }

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load notifications", { code: error.code, details: error });
    }
    return { data: (data ?? []) as Notification[], count: count ?? 0 };
  },
  async markRead(id, tenantId, userId) {
    await this.commandAcknowledge({
      notificationId: id,
      tenantId,
      userId,
      idempotencyKey: `notification_ack:${id}:${userId}`,
    });
  },
  async markManyRead(ids, tenantId, userId) {
    if (ids.length === 0) return;
    for (const id of ids) {
      await this.commandAcknowledge({
        notificationId: id,
        tenantId,
        userId,
        idempotencyKey: `notification_ack:${id}:${userId}`,
      });
    }
  },
  async create(input) {
    const result = await this.commandDelivery({
      tenantId: input.tenant_id,
      userId: input.user_id,
      title: input.title,
      body: input.body ?? null,
      type: input.type,
      read: input.read ?? false,
      deliveryKey: `manual:${createNotificationNonce()}`,
    });
    if (!result.notification) {
      throw new ServiceError("Notification delivery command returned no notification", { code: "NOTIFICATION_DELIVERY_EMPTY_RESULT" });
    }
    return result.notification;
  },
  async commandDelivery(input) {
    const { data, error } = await platformRepository.rpc("command_notification_delivery", {
      p_tenant_id: input.tenantId,
      p_user_id: input.userId,
      p_title: input.title,
      p_body: input.body ?? null,
      p_type: input.type,
      p_delivery_key: input.deliveryKey,
      p_source_event_id: input.sourceEventId ?? null,
      p_source_outbox_id: input.sourceOutboxId ?? null,
      p_read: input.read ?? false,
      p_idempotency_key: input.idempotencyKey ?? input.deliveryKey,
      p_request_hash: input.requestHash ?? null,
      p_actor_user_id: input.actorUserId ?? null,
      ...commandTraceParams(input.trace),
    }, notificationCtx(input.tenantId, "notifications.commandDelivery", "tenant-critical", [...NOTIFICATION_WRITE_CAPS], input.trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to deliver notification", { code: error.code, details: error });
    }
    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Notification delivery command returned no result", { code: "NOTIFICATION_DELIVERY_EMPTY_RESULT" });
    }
    return {
      result_code: row.result_code,
      retryable: Boolean(row.retryable),
      idempotency_replay: Boolean(row.idempotency_replay),
      message: row.message ?? null,
      notification: (row.notification ?? null) as Notification | null,
    };
  },
  async commandAcknowledge(input) {
    const { data, error } = await platformRepository.rpc("command_notification_acknowledge", {
      p_notification_id: input.notificationId,
      p_tenant_id: input.tenantId,
      p_user_id: input.userId,
      p_expected_updated_at: input.expectedUpdatedAt ?? null,
      p_idempotency_key: input.idempotencyKey ?? null,
      p_request_hash: input.requestHash ?? null,
      p_actor_user_id: input.actorUserId ?? null,
      ...commandTraceParams(input.trace),
    }, notificationCtx(input.tenantId, "notifications.commandAcknowledge", "tenant-critical", [...NOTIFICATION_WRITE_CAPS], input.trace));
    if (error) {
      throw new ServiceError(error.message ?? "Failed to acknowledge notification", { code: error.code, details: error });
    }
    const row = (data as any)?.[0];
    if (!row) {
      throw new ServiceError("Notification acknowledgement command returned no result", { code: "NOTIFICATION_ACK_EMPTY_RESULT" });
    }
    return {
      result_code: row.result_code,
      retryable: Boolean(row.retryable),
      idempotency_replay: Boolean(row.idempotency_replay),
      message: row.message ?? null,
      notification: (row.notification ?? null) as Notification | null,
    };
  },
  subscribeToUser(tenantId, userId, onInsert) {
    return platform.realtime.subscribeEntity({
      ctx: { tenantId, userId, sessionVersion: null },
      tables: ["notifications"],
      onPayload: (payload) => {
        if (payload.type !== "INSERT") return;
        const row = payload.row as Notification | null;
        if (!row || row.tenant_id !== tenantId || row.user_id !== userId) return;
        onInsert(row);
      },
    });
  },
  async listRecentDeliveryAuditEvidence(tenantId, limit = 8) {
    const { data, error } = await platformRepository
      .from("audit_logs", notificationCtx(tenantId, "notifications.deliveryAuditEvidence", "readonly", [...NOTIFICATION_READ_CAPS]))
      .select("id, tenant_id, action, created_at, details")
      .eq("tenant_id", tenantId)
      .eq("action", "notification_delivered")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load notification delivery audit evidence", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as NotificationDeliveryAuditRow[];
  },
  async listDeliveryAuditByWorkflowTraceId(tenantId, workflowTraceId, limit = 20) {
    const { data, error } = await platformRepository
      .from("audit_logs", notificationCtx(tenantId, "notifications.deliveryAuditByTrace", "readonly", [...NOTIFICATION_READ_CAPS]))
      .select("id, tenant_id, action, created_at, details")
      .eq("tenant_id", tenantId)
      .eq("action", "notification_delivered")
      .contains("details", { workflowTraceId })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load notification delivery audit by trace", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? []) as NotificationDeliveryAuditRow[];
  },
  describe() {
    return {
      certified: true,
      tenantBound: true,
      traceAware: true,
      runtimeAware: true,
      capabilityAware: true,
      reconciliationAware: true,
      recoveryAware: true,
      evidenceAware: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: [Capabilities.notifications.read, Capabilities.notifications.write],
    };
  },
};

function createNotificationNonce() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
