import { useState, useEffect } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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

  useEffect(() => {
    if (isDemo || !user?.id) {
      setLoading(false);
      return;
    }

    supabase
      .from("notification_preferences" as any)
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPrefs({
            appointment_reminders: (data as any).appointment_reminders,
            lab_results_ready: (data as any).lab_results_ready,
            billing_alerts: (data as any).billing_alerts,
            system_updates: (data as any).system_updates,
          });
        }
        setLoading(false);
      });
  }, [user?.id, isDemo]);

  const handleSave = async () => {
    if (isDemo || !user?.id) return;
    setSaving(true);

    const { error } = await supabase
      .from("notification_preferences" as any)
      .upsert(
        {
          user_id: user.id,
          tenant_id: user.tenantId,
          ...prefs,
        },
        { onConflict: "user_id" },
      );

    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("settings.preferencesSaved") });
    }
    setSaving(false);
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
