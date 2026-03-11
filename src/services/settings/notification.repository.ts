import type { NotificationPreferences, NotificationPreferencesUpdateInput } from "@/domain/settings/notification.types";
import { supabase } from "@/services/supabase/client";
import { ServiceError } from "@/services/supabase/errors";

const PREF_COLUMNS = "id, user_id, tenant_id, appointment_reminders, lab_results_ready, billing_alerts, system_updates, created_at, updated_at";

export interface NotificationPreferencesRepository {
  getByUserId(userId: string, tenantId: string): Promise<NotificationPreferences | null>;
  upsert(userId: string, tenantId: string, input: NotificationPreferencesUpdateInput): Promise<NotificationPreferences>;
}

export const notificationPreferencesRepository: NotificationPreferencesRepository = {
  async getByUserId(userId, tenantId) {
    const { data, error } = await supabase
      .from("notification_preferences")
      .select(PREF_COLUMNS)
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to load notification preferences", {
        code: error.code,
        details: error,
      });
    }

    return (data ?? null) as NotificationPreferences | null;
  },
  async upsert(userId, tenantId, input) {
    const payload: Record<string, unknown> = {
      user_id: userId,
      tenant_id: tenantId,
    };

    if (input.appointment_reminders !== undefined) payload.appointment_reminders = input.appointment_reminders;
    if (input.lab_results_ready !== undefined) payload.lab_results_ready = input.lab_results_ready;
    if (input.billing_alerts !== undefined) payload.billing_alerts = input.billing_alerts;
    if (input.system_updates !== undefined) payload.system_updates = input.system_updates;

    const { data, error } = await supabase
      .from("notification_preferences")
      .upsert(payload, { onConflict: "user_id" })
      .select(PREF_COLUMNS)
      .single();

    if (error) {
      throw new ServiceError(error.message ?? "Failed to save notification preferences", {
        code: error.code,
        details: error,
      });
    }

    return data as NotificationPreferences;
  },
};
