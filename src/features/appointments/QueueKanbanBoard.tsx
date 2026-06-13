import type { AppointmentQueueStatus, AppointmentQueueWithRelations } from "@/domain/appointmentQueue/appointmentQueue.types";
import { formatDate } from "@/shared/utils/formatDate";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { cn } from "@/lib/utils";

const COLUMN_STATUSES: AppointmentQueueStatus[] = ["waiting", "called", "in_service", "done", "no_show"];

type QueueKanbanCardProps = {
  entry: AppointmentQueueWithRelations;
  locale: string;
  calendarType: "gregorian" | "hijri";
  t: (path: string, options?: Record<string, unknown>) => string;
  draggable?: boolean;
  onDragStart?: (queueId: string) => void;
};

export function QueueKanbanCard({
  entry,
  locale,
  calendarType,
  t,
  draggable = true,
  onDragStart,
}: QueueKanbanCardProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={() => onDragStart?.(entry.id)}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm space-y-2",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight">
          {entry.appointments?.patients?.full_name ?? t("appointments.queue.unknownPatient")}
        </p>
        <StatusBadge variant="default" className="shrink-0 text-[10px]">
          {formatDate(entry.check_in_at, locale, "time", calendarType)}
        </StatusBadge>
      </div>
      <p className="text-xs text-muted-foreground">
        {entry.appointments?.doctors?.full_name ?? t("appointments.queue.unassignedDoctor")}
      </p>
    </div>
  );
}

type QueueKanbanColumnProps = {
  status: AppointmentQueueStatus;
  title: string;
  entries: AppointmentQueueWithRelations[];
  locale: string;
  calendarType: "gregorian" | "hijri";
  t: (path: string, options?: Record<string, unknown>) => string;
  onDropStatus: (status: AppointmentQueueStatus) => void;
  onDragStart: (queueId: string) => void;
  compact?: boolean;
};

export function QueueKanbanColumn({
  status,
  title,
  entries,
  locale,
  calendarType,
  t,
  onDropStatus,
  onDragStart,
  compact,
}: QueueKanbanColumnProps) {
  return (
    <div
      className={cn("flex min-h-[280px] flex-col rounded-xl border bg-muted/20", compact ? "p-2" : "p-3")}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDropStatus(status)}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium tabular-nums">{entries.length}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {entries.map((entry) => (
          <QueueKanbanCard
            key={entry.id}
            entry={entry}
            locale={locale}
            calendarType={calendarType}
            t={t}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  );
}

export { COLUMN_STATUSES };
