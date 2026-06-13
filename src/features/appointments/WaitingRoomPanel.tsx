import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useI18n } from "@/core/i18n/i18nStore";
import { Button } from "@/components/primitives/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { formatDate } from "@/shared/utils/formatDate";
import type { AppointmentQueueStatus, AppointmentQueueWithRelations } from "@/domain/appointmentQueue/appointmentQueue.types";
import { QueueKanbanBoardPanel } from "./QueueKanbanBoardPanel";

interface WaitingRoomPanelProps {
  entries: AppointmentQueueWithRelations[];
  isLoading: boolean;
  onUpdateStatus: (queueId: string, status: AppointmentQueueStatus) => Promise<void> | void;
}

const STATUS_ORDER: Record<AppointmentQueueStatus, number> = {
  waiting: 0,
  called: 1,
  in_service: 2,
  done: 3,
  no_show: 4,
};

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

function queueStatusVariant(status: AppointmentQueueStatus) {
  switch (status) {
    case "done":
      return "success" as const;
    case "called":
    case "in_service":
      return "info" as const;
    case "no_show":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

export const WaitingRoomPanel = ({ entries, isLoading, onUpdateStatus }: WaitingRoomPanelProps) => {
  const { locale, calendarType, t } = useI18n(["appointments"]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<AppointmentQueueStatus | "all">("all");
  const tvMode = searchParams.get("tv") === "1";

  const toggleTvMode = () => {
    const next = new URLSearchParams(searchParams);
    if (tvMode) next.delete("tv");
    else next.set("tv", "1");
    setSearchParams(next, { replace: true });
  };

  const counts = useMemo(() => (
    entries.reduce<Record<AppointmentQueueStatus, number>>((acc, entry) => {
      acc[entry.status] += 1;
      return acc;
    }, {
      waiting: 0,
      called: 0,
      in_service: 0,
      done: 0,
      no_show: 0,
    })
  ), [entries]);

  const visibleEntries = useMemo(() => {
    const filtered = statusFilter === "all"
      ? entries
      : entries.filter((entry) => entry.status === statusFilter);

    return [...filtered].sort((left, right) => {
      const statusDelta = STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
      if (statusDelta !== 0) return statusDelta;
      return new Date(left.check_in_at).getTime() - new Date(right.check_in_at).getTime();
    });
  }, [entries, statusFilter]);

  const filters: Array<{ value: AppointmentQueueStatus | "all"; label: string; count: number }> = [
    { value: "all", label: t("common.all"), count: entries.length },
    { value: "waiting", label: queueStatusLabel("waiting", t), count: counts.waiting },
    { value: "called", label: queueStatusLabel("called", t), count: counts.called },
    { value: "in_service", label: queueStatusLabel("in_service", t), count: counts.in_service },
    { value: "done", label: queueStatusLabel("done", t), count: counts.done },
    { value: "no_show", label: queueStatusLabel("no_show", t), count: counts.no_show },
  ];

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <QueueKanbanBoardPanel
          entries={entries}
          isLoading={isLoading}
          onUpdateStatus={onUpdateStatus}
          tvMode={tvMode}
          onToggleTvMode={toggleTvMode}
        />
      </div>

      <div className={tvMode ? "hidden" : "md:hidden space-y-4"}>
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={statusFilter === filter.value ? "default" : "outline"}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label} ({filter.count})
            </Button>
          ))}
        </div>

        {isLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("appointments.queue.title")}</CardTitle>
              <CardDescription>{t("appointments.queue.loading")}</CardDescription>
            </CardHeader>
          </Card>
        ) : visibleEntries.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("appointments.queue.title")}</CardTitle>
              <CardDescription>{t("appointments.queue.empty")}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {visibleEntries.map((entry) => (
              <Card key={entry.id}>
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">
                        {entry.appointments?.patients?.full_name ?? t("appointments.queue.unknownPatient")}
                      </CardTitle>
                      <CardDescription>
                        {t("appointments.queue.appointmentSummary", {
                          doctorName: entry.appointments?.doctors?.full_name ?? t("appointments.queue.unassignedDoctor"),
                          date: entry.appointments ? formatDate(entry.appointments.appointment_date, locale, "datetime", calendarType) : t("appointments.queue.timeUnavailable"),
                        })}
                      </CardDescription>
                    </div>
                    <StatusBadge variant={queueStatusVariant(entry.status)} dot>
                      {queueStatusLabel(entry.status, t)}
                    </StatusBadge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                    <div>
                      {t("appointments.queue.checkedInAt", { time: formatDate(entry.check_in_at, locale, "time", calendarType) })}
                    </div>
                    <div>
                      {t("appointments.queue.calledAt", { time: entry.called_at ? formatDate(entry.called_at, locale, "time", calendarType) : t("appointments.queue.notYet") })}
                    </div>
                    <div>
                      {t("appointments.queue.completedAt", { time: entry.completed_at ? formatDate(entry.completed_at, locale, "time", calendarType) : t("appointments.queue.notYet") })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {entry.status === "waiting" && (
                      <>
                        <Button size="sm" onClick={() => void onUpdateStatus(entry.id, "called")}>
                          {t("appointments.queue.actions.callPatient")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void onUpdateStatus(entry.id, "no_show")}>
                          {t("appointments.queue.actions.markNoShow")}
                        </Button>
                      </>
                    )}

                    {entry.status === "called" && (
                      <>
                        <Button size="sm" onClick={() => void onUpdateStatus(entry.id, "in_service")}>
                          {t("appointments.queue.actions.startVisit")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void onUpdateStatus(entry.id, "waiting")}>
                          {t("appointments.queue.actions.backToWaiting")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void onUpdateStatus(entry.id, "no_show")}>
                          {t("appointments.queue.actions.markNoShow")}
                        </Button>
                      </>
                    )}

                    {entry.status === "in_service" && (
                      <Button size="sm" variant="success" onClick={() => void onUpdateStatus(entry.id, "done")}>
                        {t("appointments.queue.actions.completeVisit")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
