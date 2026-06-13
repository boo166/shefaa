import { useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { Button } from "@/components/primitives/Button";
import type { AppointmentQueueStatus, AppointmentQueueWithRelations } from "@/domain/appointmentQueue/appointmentQueue.types";
import { COLUMN_STATUSES, QueueKanbanColumn } from "./QueueKanbanBoard";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface QueueKanbanBoardProps {
  entries: AppointmentQueueWithRelations[];
  isLoading: boolean;
  onUpdateStatus: (queueId: string, status: AppointmentQueueStatus) => Promise<void> | void;
  tvMode?: boolean;
  onToggleTvMode?: () => void;
}

function queueStatusLabel(status: AppointmentQueueStatus, t: (path: string, options?: Record<string, unknown>) => string) {
  switch (status) {
    case "waiting":
      return t("appointments.queue.status.waiting");
    case "called":
      return t("appointments.queue.status.called");
    case "in_service":
      return t("appointments.queue.status.inService");
    case "done":
      return t("appointments.queue.status.done");
    case "no_show":
      return t("appointments.queue.status.noShow");
    default:
      return status;
  }
}

export function QueueKanbanBoardPanel({
  entries,
  isLoading,
  onUpdateStatus,
  tvMode = false,
  onToggleTvMode,
}: QueueKanbanBoardProps) {
  const { locale, calendarType, t } = useI18n(["appointments"]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(COLUMN_STATUSES.map((status) => [status, [] as AppointmentQueueWithRelations[]])) as Record<
      AppointmentQueueStatus,
      AppointmentQueueWithRelations[]
    >;
    for (const entry of entries) {
      map[entry.status]?.push(entry);
    }
    for (const status of COLUMN_STATUSES) {
      map[status].sort((a, b) => new Date(a.check_in_at).getTime() - new Date(b.check_in_at).getTime());
    }
    return map;
  }, [entries]);

  const handleDrop = async (status: AppointmentQueueStatus) => {
    if (!draggingId) return;
    const entry = entries.find((item) => item.id === draggingId);
    setDraggingId(null);
    if (!entry || entry.status === status) return;
    await onUpdateStatus(draggingId, status);
  };

  if (isLoading) {
    return <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">{t("appointments.queue.loading")}</div>;
  }

  return (
    <div className={cn("space-y-4", tvMode && "fixed inset-0 z-50 bg-background p-6 overflow-auto")}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{t("appointments.queue.boardTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("appointments.queue.boardSubtitle")}</p>
        </div>
        {onToggleTvMode ? (
          <Button type="button" variant="outline" size="sm" onClick={onToggleTvMode}>
            {tvMode ? <Minimize2 className="h-4 w-4 me-2" /> : <Maximize2 className="h-4 w-4 me-2" />}
            {tvMode ? t("appointments.queue.exitTvMode") : t("appointments.queue.tvMode")}
          </Button>
        ) : null}
      </div>

      <div className={cn("grid gap-3", tvMode ? "grid-cols-5" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-5")}>
        {COLUMN_STATUSES.map((status) => (
          <QueueKanbanColumn
            key={status}
            status={status}
            title={queueStatusLabel(status, t)}
            entries={grouped[status]}
            locale={locale}
            calendarType={calendarType}
            t={t}
            onDropStatus={handleDrop}
            onDragStart={setDraggingId}
            compact={!tvMode}
          />
        ))}
      </div>
    </div>
  );
}
