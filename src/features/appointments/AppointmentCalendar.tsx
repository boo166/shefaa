import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type AppointmentCalendarView = "month" | "week";

export type AppointmentCalendarItem = {
  id: string;
  patient_name: string;
  doctor_name: string;
  appointment_date: string;
  type: string;
  status: string;
};

type Props = {
  appointments: AppointmentCalendarItem[];
  view: AppointmentCalendarView;
  onViewChange: (view: AppointmentCalendarView) => void;
  rescheduleEnabled: boolean;
  onReschedule: (appointmentId: string, newAppointmentDate: string) => Promise<void> | void;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseAppointmentDate(raw: string): Date {
  // Handles ISO, and "YYYY-MM-DD HH:mm" (demo)
  if (!raw) return new Date(NaN);
  if (raw.includes("T")) return new Date(raw);
  if (raw.includes(" ")) return new Date(raw.replace(" ", "T"));
  return new Date(raw);
}

function formatDatetimeLocal(d: Date) {
  return `${toLocalYMD(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function startOfWeek(d: Date) {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // Sunday=0
  out.setDate(out.getDate() - day);
  return out;
}

function addDays(d: Date, days: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const statusChipClass: Record<string, string> = {
  completed: "bg-success/15 text-success",
  in_progress: "bg-info/15 text-info",
  scheduled: "bg-muted text-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export function AppointmentCalendar({
  appointments,
  view,
  onViewChange,
  rescheduleEnabled,
  onReschedule,
}: Props) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });

  const groupedByDay = useMemo(() => {
    const map = new Map<string, AppointmentCalendarItem[]>();
    for (const a of appointments) {
      const d = parseAppointmentDate(a.appointment_date);
      const key = toLocalYMD(d);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }

    // Sort appointments inside each day by time asc
    for (const [key, list] of map.entries()) {
      list.sort((x, y) => {
        const dx = parseAppointmentDate(x.appointment_date).getTime();
        const dy = parseAppointmentDate(y.appointment_date).getTime();
        return dx - dy;
      });
      map.set(key, list);
    }

    return map;
  }, [appointments]);

  const handlePrev = () => {
    setCursor((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(next.getMonth() - 1);
      else next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const handleNext = () => {
    setCursor((d) => {
      const next = new Date(d);
      if (view === "month") next.setMonth(next.getMonth() + 1);
      else next.setDate(next.getDate() + 7);
      return next;
    });
  };

  const title = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(cursor);
      const end = addDays(start, 6);
      return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [cursor, view]);

  const rangeDays = useMemo(() => {
    if (view === "week") {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }

    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor, view]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const onDropDay = async (day: Date, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);

    if (!rescheduleEnabled) return;

    const appointmentId = e.dataTransfer.getData("text/plain");
    if (!appointmentId) return;

    const appt = appointments.find((a) => a.id === appointmentId);
    if (!appt) return;

    const current = parseAppointmentDate(appt.appointment_date);
    if (Number.isNaN(current.getTime())) return;

    const target = new Date(current);
    target.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());

    // No-op if same day
    if (sameDay(current, target)) return;

    await onReschedule(appointmentId, formatDatetimeLocal(target));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrev} aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(today))}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={handleNext} aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{title}</h3>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={view === "month" ? "default" : "outline"}
              onClick={() => onViewChange("month")}
            >
              Month
            </Button>
            <Button
              size="sm"
              variant={view === "week" ? "default" : "outline"}
              onClick={() => onViewChange("week")}
            >
              Week
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className={cn("grid border-b bg-muted/30", view === "month" ? "grid-cols-7" : "grid-cols-7")}>
          {weekdayShort.map((d) => (
            <div key={d} className="px-3 py-2 text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        <div
          className={cn(
            "grid",
            view === "month" ? "grid-cols-7" : "grid-cols-7",
          )}
        >
          {rangeDays.map((day) => {
            const key = toLocalYMD(day);
            const dayAppointments = groupedByDay.get(key) ?? [];
            const isOutside = view === "month" && day.getMonth() !== cursor.getMonth();
            const isToday = sameDay(day, today);
            const isDragOver = dragOverKey === key;

            return (
              <div
                key={key}
                onDragOver={(e) => {
                  if (!rescheduleEnabled) return;
                  e.preventDefault();
                  setDragOverKey(key);
                }}
                onDragLeave={() => setDragOverKey((v) => (v === key ? null : v))}
                onDrop={(e) => void onDropDay(day, e)}
                className={cn(
                  "min-h-[110px] border-t border-l p-2 transition-colors",
                  isOutside && "bg-muted/20 text-muted-foreground",
                  isToday && "ring-2 ring-inset ring-primary/30",
                  isDragOver && "bg-accent/40",
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={cn("text-xs font-medium", isOutside && "text-muted-foreground")}>
                    {day.getDate()}
                  </span>
                  {dayAppointments.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{dayAppointments.length}</span>
                  )}
                </div>

                <div className="space-y-1">
                  {dayAppointments.slice(0, 3).map((a) => {
                    const dt = parseAppointmentDate(a.appointment_date);
                    const time = Number.isNaN(dt.getTime()) ? "" : dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                    return (
                      <div
                        key={a.id}
                        draggable={rescheduleEnabled}
                        onDragStart={(e) => {
                          if (!rescheduleEnabled) return;
                          e.dataTransfer.setData("text/plain", a.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className={cn(
                          "rounded-md px-2 py-1 text-xs leading-tight cursor-default select-none",
                          rescheduleEnabled && "cursor-grab active:cursor-grabbing",
                          statusChipClass[a.status] ?? "bg-muted text-foreground",
                        )}
                        title={`${a.patient_name} • ${a.doctor_name}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{a.patient_name}</span>
                          <span className="shrink-0 text-[10px] opacity-80">{time}</span>
                        </div>
                      </div>
                    );
                  })}
                  {dayAppointments.length > 3 && (
                    <div className="text-[10px] text-muted-foreground px-1">
                      +{dayAppointments.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!rescheduleEnabled && (
        <p className="text-xs text-muted-foreground">
          Drag-to-reschedule is only available for users with appointment management access.
        </p>
      )}
    </div>
  );
}
