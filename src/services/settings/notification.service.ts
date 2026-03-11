import { notificationPreferencesSchema, notificationPreferencesUpdateSchema } from "@/domain/settings/notification.schema";
import type { NotificationPreferencesUpdateInput } from "@/domain/settings/notification.types";
import { toServiceError } from "@/services/supabase/errors";
import { getTenantContext } from "@/services/supabase/tenant";
import { notificationPreferencesRepository } from "./notification.repository";

const DEFAULT_PREFS = {
  appointment_reminders: true,
  lab_results_ready: true,
  billing_alerts: true,
  system_updates: false,
};

export const notificationPreferencesService = {
  async getCurrentUserPreferences(userId: string) {
    try {
      const { tenantId } = getTenantContext();
      const result = await notificationPreferencesRepository.getByUserId(userId, tenantId);
      if (!result) {
        return DEFAULT_PREFS;
      }
      return notificationPreferencesSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to load notification preferences");
    }
  },
  async saveCurrentUserPreferences(userId: string, input: NotificationPreferencesUpdateInput) {
    try {
      const parsed = notificationPreferencesUpdateSchema.parse(input);
      const { tenantId } = getTenantContext();
      const result = await notificationPreferencesRepository.upsert(userId, tenantId, parsed);
      return notificationPreferencesSchema.parse(result);
    } catch (err) {
      throw toServiceError(err, "Failed to save notification preferences");
    }
  },
};
