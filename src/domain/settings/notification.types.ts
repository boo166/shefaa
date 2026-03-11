import type { z } from "zod";
import { notificationPreferencesSchema, notificationPreferencesUpdateSchema } from "./notification.schema";

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type NotificationPreferencesUpdateInput = z.infer<typeof notificationPreferencesUpdateSchema>;
