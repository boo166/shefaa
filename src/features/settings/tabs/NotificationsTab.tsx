import { useState, useEffect } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { notificationPreferencesService } from "@/services/settings/notification.service";
import { queryKeys } from "@/services/queryKeys";

interface NotifPrefs {
  appointment_reminders: boolean;
  lab_results_ready: boolean;
  billing_alerts: boolean;
  system_updates: boolean;
}

const DEFAULTS: NotifPrefs = {
  appointment_reminders: true,
  lab_results_ready: true,
  billing_alerts: true,
  system_updates: false,
};

export const NotificationsTab = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: loadedPrefs } = useQuery({
    queryKey: user?.id ? queryKeys.settings.notifications(user.id, user.tenantId) : ["settings", "notifications", "anon"],
    enabled: !isDemo && !!user?.id,
    queryFn: () => notificationPreferencesService.getCurrentUserPreferences(user?.id ?? ""),
  });

  useEffect(() => {
    if (isDemo || !user?.id) {
      setLoading(false);
      return;
    }

    if (loadedPrefs) {
      setPrefs({
        appointment_reminders: loadedPrefs.appointment_reminders,
        lab_results_ready: loadedPrefs.lab_results_ready,
        billing_alerts: loadedPrefs.billing_alerts,
        system_updates: loadedPrefs.system_updates,
      });
      setLoading(false);
    }
  }, [loadedPrefs, isDemo, user?.id]);

  const handleSave = async () => {
    if (isDemo || !user?.id) return;
    setSaving(true);

    try {
      await notificationPreferencesService.saveCurrentUserPreferences(user.id, prefs);
      toast({ title: t("settings.preferencesSaved") });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggles: { key: keyof NotifPrefs; label: string }[] = [
    { key: "appointment_reminders", label: t("settings.appointmentReminders") },
    { key: "lab_results_ready", label: t("settings.labResultsReady") },
    { key: "billing_alerts", label: t("settings.billingAlerts") },
    { key: "system_updates", label: t("settings.systemUpdates") },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{t("settings.notifPreferences")}</h3>
      {toggles.map((pref) => (
        <div key={pref.key} className="flex items-center justify-between p-3 rounded-lg border">
          <span className="text-sm">{pref.label}</span>
          <Switch
            checked={prefs[pref.key]}
            onCheckedChange={(checked) => setPrefs({ ...prefs, [pref.key]: checked })}
          />
        </div>
      ))}
      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("common.save")}
      </Button>
    </div>
  );
};
