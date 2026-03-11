import { useState, useEffect } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/services/queryKeys";
import { doctorScheduleService } from "@/services/doctors/doctorSchedule.service";

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

function mergeSchedule(rows: ScheduleRow[]) {
  return DEFAULT_SCHEDULE.map((def) => {
    const found = rows.find((row) => row.day_of_week === def.day_of_week);
    return found
      ? {
        ...def,
        start_time: found.start_time,
        end_time: found.end_time,
        is_active: found.is_active,
        id: found.id,
      }
      : def;
  });
}

export const DoctorScheduleModal = ({ open, onClose, doctorId, doctorName }: Props) => {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [schedule, setSchedule] = useState<ScheduleRow[]>(DEFAULT_SCHEDULE);
  const [saving, setSaving] = useState(false);
  const isDemo = user?.tenantId === "demo";

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: queryKeys.doctors.schedules(doctorId, user?.tenantId),
    queryFn: async () => {
      if (!doctorId) return DEFAULT_SCHEDULE;
      const rows = await doctorScheduleService.listByDoctor(doctorId);
      const mapped = rows.map((row) => ({
        day_of_week: row.day_of_week,
        start_time: row.start_time,
        end_time: row.end_time,
        is_active: row.is_active,
        id: row.id,
      }));
      return mergeSchedule(mapped);
    },
    enabled: open && !!doctorId && !!user?.tenantId && !isDemo,
  });

  useEffect(() => {
    if (!open) return;
    if (isDemo) {
      setSchedule(DEFAULT_SCHEDULE);
      return;
    }
    if (scheduleData) {
      setSchedule(scheduleData);
    }
  }, [open, isDemo, scheduleData]);

  const updateRow = (dayIdx: number, field: keyof ScheduleRow, value: any) => {
    setSchedule((prev) =>
      prev.map((row) => (row.day_of_week === dayIdx ? { ...row, [field]: value } : row))
    );
  };

  const handleSave = async () => {
    if (!user || !doctorId || isDemo) return;
    setSaving(true);

    try {
      await doctorScheduleService.save(
        doctorId,
        schedule.map((row) => ({
          day_of_week: row.day_of_week,
          start_time: row.start_time,
          end_time: row.end_time,
          is_active: row.is_active,
        })),
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.doctors.schedules(doctorId, user.tenantId) });
      toast({ title: t("common.saved") });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const dayLabels = locale === "ar" ? DAYS_AR : DAYS;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{doctorName} — {t("doctors.schedule")}</DialogTitle>
        </DialogHeader>

        {(!isDemo && isLoading) ? (
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
