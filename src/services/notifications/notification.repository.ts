import type { Notification, NotificationCreateInput } from "@/domain/notifications/notification.types";
import { platformRepository } from "@/platform/data/platformRepository";
import type { PlatformRepositoryContext } from "@/platform/data/platformRepository.context";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const NOTIFICATION_COLUMNS = "id, tenant_id, user_id, title, body, type, read, created_at";

function notificationCtx(
  tenantId: string | null,
  action: string,
  classification: PlatformRepositoryContext["classification"] = "tenant-critical",
): PlatformRepositoryContext {
  return { action, classification, tenantScoped: Boolean(tenantId), tenantId };
}

export interface NotificationRepository {
  listByUserPaged(tenantId: string, userId: string, limit: number, offset: number): Promise<{ data: Notification[]; count: number }>;
  markRead(id: string, tenantId: string, userId: string): Promise<void>;
  markManyRead(ids: string[], tenantId: string, userId: string): Promise<void>;
  create(input: NotificationCreateInput): Promise<Notification>;
  subscribeToUser(
    tenantId: string,
    userId: string,
    onInsert: (payload: Notification) => void,
  ): { unsubscribe: () => void };
  describe?(): {
    certified: boolean;
    tenantBound: boolean;
    retryAware: boolean;
    staleContextSafe: boolean;
    metricsEnabled: boolean;
    requiredCapabilities: string[];
  };
}

export const notificationRepository: NotificationRepository = {
  async listByUserPaged(tenantId, userId, limit, offset) {
    const to = Math.max(0, offset + limit - 1);
    const { data, error, count } = await platformRepository
      .from("notifications", notificationCtx(tenantId, "notifications.listByUserPaged", "readonly"))
      .select(NOTIFICATION_COLUMNS, { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, to);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to load notifications", { code: error.code, details: error });
    }
    return { data: (data ?? []) as Notification[], count: count ?? 0 };
  },
  async markRead(id, tenantId, userId) {
    const { error } = await platformRepository
      .from("notifications", notificationCtx(tenantId, "notifications.markRead", "critical"))
      .update({ read: true })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update notification", { code: error.code, details: error });
    }
  },
  async markManyRead(ids, tenantId, userId) {
    if (ids.length === 0) return;
    const { error } = await platformRepository
      .from("notifications", notificationCtx(tenantId, "notifications.markManyRead", "critical"))
      .update({ read: true })
      .in("id", ids)
      .eq("tenant_id", tenantId)
      .eq("user_id", userId);
    if (error) {
      throw new ServiceError(error.message ?? "Failed to update notifications", { code: error.code, details: error });
    }
  },
  async create(input) {
    const { data, error } = await platformRepository
      .from("notifications", notificationCtx(input.tenant_id, "notifications.create", "eventual"))
      .insert({
        tenant_id: input.tenant_id,
        user_id: input.user_id,
        title: input.title,
        body: input.body ?? null,
        type: input.type,
        read: input.read ?? false,
      })
      .select(NOTIFICATION_COLUMNS)
      .single();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to create notification", { code: error.code, details: error });
    }

    return data as Notification;
  },
  subscribeToUser(tenantId, userId, onInsert) {
    const channel = supabase
      .channel(`user-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Notification;
          if (row.tenant_id !== tenantId) return;
          onInsert(row);
        },
      )
      .subscribe();
    return {
      unsubscribe: () => {
        void supabase.removeChannel(channel).catch(() => undefined);
      },
    };
  },
  describe() {
    return {
      certified: false,
      tenantBound: true,
      retryAware: true,
      staleContextSafe: true,
      metricsEnabled: true,
      requiredCapabilities: ["notifications.read", "notifications.write"],
    };
  },
};
