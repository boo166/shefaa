import { useState, useEffect } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  doctorId: string;
  doctorName: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

interface ScheduleRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  id?: string;
}

const DEFAULT_SCHEDULE: ScheduleRow[] = Array.from({ length: 7 }, (_, i) => ({
  day_of_week: i,
  start_time: "09:00",
  end_time: "17:00",
  is_active: i >= 1 && i <= 5, // Mon-Fri active
}));

export const DoctorScheduleModal = ({ open, onClose, doctorId, doctorName }: Props) => {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [schedule, setSchedule] = useState<ScheduleRow[]>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !doctorId) return;
    setLoading(true);
    supabase
      .from("doctor_schedules" as any)
      .select("*")
      .eq("doctor_id", doctorId)
      .then(({ data, error }) => {
        if (!error && data && data.length > 0) {
          const merged = DEFAULT_SCHEDULE.map((def) => {
            const found = (data as any[]).find((d) => d.day_of_week === def.day_of_week);
            return found
              ? { ...def, start_time: found.start_time?.slice(0, 5), end_time: found.end_time?.slice(0, 5), is_active: found.is_active, id: found.id }
              : def;
          });
          setSchedule(merged);
        } else {
          setSchedule(DEFAULT_SCHEDULE);
        }
        setLoading(false);
      });
  }, [open, doctorId]);

  const updateRow = (dayIdx: number, field: keyof ScheduleRow, value: any) => {
    setSchedule((prev) =>
      prev.map((row) => (row.day_of_week === dayIdx ? { ...row, [field]: value } : row))
    );
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    // Upsert all rows
    for (const row of schedule) {
      if (row.id) {
        await supabase
          .from("doctor_schedules" as any)
          .update({ start_time: row.start_time, end_time: row.end_time, is_active: row.is_active })
          .eq("id", row.id);
      } else {
        await supabase.from("doctor_schedules" as any).insert({
          doctor_id: doctorId,
          tenant_id: user.tenantId,
          day_of_week: row.day_of_week,
          start_time: row.start_time,
          end_time: row.end_time,
          is_active: row.is_active,
        });
      }
    }

    toast({ title: t("common.saved") });
    setSaving(false);
    onClose();
  };

  const dayLabels = locale === "ar" ? DAYS_AR : DAYS;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{doctorName} — {t("doctors.schedule")}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {schedule.map((row) => (
              <div key={row.day_of_week} className="flex items-center gap-3">
                <Switch
                  checked={row.is_active}
                  onCheckedChange={(v) => updateRow(row.day_of_week, "is_active", v)}
                />
                <span className="w-24 text-sm font-medium">{dayLabels[row.day_of_week]}</span>
                <Input
                  type="time"
                  value={row.start_time}
                  onChange={(e) => updateRow(row.day_of_week, "start_time", e.target.value)}
                  className="w-28"
                  disabled={!row.is_active}
                />
                <span className="text-muted-foreground text-sm">→</span>
                <Input
                  type="time"
                  value={row.end_time}
                  onChange={(e) => updateRow(row.day_of_week, "end_time", e.target.value)}
                  className="w-28"
                  disabled={!row.is_active}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
