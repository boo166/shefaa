import { useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { CalendarPlus, CheckCircle, XCircle, Play, CalendarDays, List } from "lucide-react";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { formatDate } from "@/shared/utils/formatDate";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { useQueryClient } from "@tanstack/react-query";
import { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AppointmentCalendar, AppointmentCalendarItem, AppointmentCalendarView } from "./AppointmentCalendar";

type Appointment = Tables<"appointments"> & {
  patients?: { full_name: string } | null;
  doctors?: { full_name: string } | null;
};

const DEMO_APPOINTMENTS = [
  { id: "1", patient_name: "Mohammed Al-Rashid", doctor_name: "Dr. Sarah Ahmed", appointment_date: "2026-03-08 09:00", type: "checkup", status: "completed" },
  { id: "2", patient_name: "Fatima Hassan", doctor_name: "Dr. John Smith", appointment_date: "2026-03-08 10:30", type: "follow_up", status: "in_progress" },
  { id: "3", patient_name: "Ali Mansour", doctor_name: "Dr. Sarah Ahmed", appointment_date: "2026-03-08 11:00", type: "consultation", status: "scheduled" },
  { id: "4", patient_name: "Noor Ibrahim", doctor_name: "Dr. Layla Khalid", appointment_date: "2026-03-08 14:00", type: "checkup", status: "scheduled" },
  { id: "5", patient_name: "Khalid Omar", doctor_name: "Dr. John Smith", appointment_date: "2026-03-08 15:30", type: "emergency", status: "cancelled" },
];

const statusVariant = { completed: "success", in_progress: "info", scheduled: "default", cancelled: "destructive" } as const;

type ViewMode = "list" | "calendar";

function parseLooseDate(raw: string) {
  if (!raw) return new Date(NaN);
  if (raw.includes("T")) return new Date(raw);
  if (raw.includes(" ")) return new Date(raw.replace(" ", "T"));
  return new Date(raw);
}

export const AppointmentsPage = () => {
  const { t, locale } = useI18n();
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const canManage = hasPermission("manage_appointments");

  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [calendarView, setCalendarView] = useState<AppointmentCalendarView>("month");

  useRealtimeSubscription(["appointments"]);

  const { data: liveAppointments = [], isLoading } = useSupabaseTable<Appointment>("appointments", {
    select: "*, patients(full_name), doctors(full_name)",
    orderBy: { column: "appointment_date", ascending: false },
  });

  const { data: patients = [] } = useSupabaseTable<Tables<"patients">>("patients");
  const { data: doctors = [] } = useSupabaseTable<Tables<"doctors">>("doctors");

  const statusLabel = (s: string) => {
    switch (s) {
      case "scheduled":
        return t("appointments.scheduled");
      case "in_progress":
        return t("appointments.inProgress");
      case "completed":
        return t("appointments.completed");
      case "cancelled":
        return t("appointments.cancelled");
      default:
        return s;
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "checkup":
        return t("appointments.checkup");
      case "follow_up":
        return t("appointments.followUp");
      case "consultation":
        return t("appointments.consultation");
      case "emergency":
        return t("appointments.emergency");
      default:
        return type;
    }
  };

  const displayData: AppointmentCalendarItem[] = isDemo
    ? DEMO_APPOINTMENTS
    : liveAppointments.map((a) => ({
        id: a.id,
        patient_name: a.patients?.full_name ?? "—",
        doctor_name: a.doctors?.full_name ?? "—",
        appointment_date: a.appointment_date,
        type: a.type,
        status: a.status,
      }));

  const filtered = useMemo(
    () => (statusFilter ? displayData.filter((a) => a.status === statusFilter) : displayData),
    [displayData, statusFilter],
  );

  const statusCounts = displayData.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    if (isDemo) return;
    const { error } = await supabase.from("appointments").update({ status: newStatus }).eq("id", id);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("appointments.appointmentStatusUpdated"), description: statusLabel(newStatus) });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    }
  };

  const handleReschedule = async (id: string, newAppointmentDate: string) => {
    if (isDemo) return;
    const { error } = await supabase
      .from("appointments")
      .update({ appointment_date: newAppointmentDate })
      .eq("id", id);

    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("appointments.appointmentRescheduled") });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    }
  };

  const columns: Column<(typeof displayData)[0]>[] = [
    {
      key: "patient_name",
      header: t("appointments.patient"),
      searchable: true,
      render: (a) => <span className="font-medium">{a.patient_name}</span>,
    },
    { key: "doctor_name", header: t("appointments.doctor"), searchable: true },
    {
      key: "appointment_date",
      header: t("appointments.dateTime"),
      render: (a) => formatDate(a.appointment_date, locale, "datetime"),
    },
    {
      key: "type",
      header: t("appointments.type"),
      render: (a) => <StatusBadge variant="default">{typeLabel(a.type)}</StatusBadge>,
    },
    {
      key: "status",
      header: t("common.status"),
      render: (a) => (
        <StatusBadge variant={(statusVariant as any)[a.status] ?? "default"}>
          {statusLabel(a.status)}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (a) =>
        a.status === "scheduled" ? (
          <div className="flex gap-1">
            <button
              onClick={() => handleUpdateStatus(a.id, "in_progress")}
              className="p-1.5 rounded-md hover:bg-info/10 text-info"
              title={t("common.start")}
            >
              <Play className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleUpdateStatus(a.id, "cancelled")}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
              title={t("common.cancel")}
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        ) : a.status === "in_progress" ? (
          <button
            onClick={() => handleUpdateStatus(a.id, "completed")}
            className="p-1.5 rounded-md hover:bg-success/10 text-success"
            title={t("common.complete")}
          >
            <CheckCircle className="h-4 w-4" />
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("appointments.title")}</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={viewMode === "list" ? "default" : "outline"} onClick={() => setViewMode("list")}>
            <List className="h-4 w-4" /> {t("common.list")}
          </Button>
          <Button
            size="sm"
            variant={viewMode === "calendar" ? "default" : "outline"}
            onClick={() => setViewMode("calendar")}
          >
            <CalendarDays className="h-4 w-4" /> {t("common.calendar")}
          </Button>

          <PermissionGuard permission="manage_appointments">
            <Button onClick={() => setShowModal(true)}>
              <CalendarPlus className="h-4 w-4" />
              {t("appointments.newAppointment")}
            </Button>
          </PermissionGuard>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["scheduled", "in_progress", "completed", "cancelled"] as const).map((status) => (
          <div
            key={status}
            className="stat-card text-center cursor-pointer hover:ring-2 ring-primary/30 transition-all"
            onClick={() => setStatusFilter(statusFilter === status ? null : status)}
          >
            <p className="text-2xl font-bold">{statusCounts[status] ?? 0}</p>
            <p className="text-sm text-muted-foreground">{statusLabel(status)}</p>
          </div>
        ))}
      </div>

      {viewMode === "list" ? (
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(a) => a.id}
          searchable
          isLoading={!isDemo && isLoading}
          exportFileName="appointments"
          filterSlot={
            <StatusFilter
              options={[
                { value: "scheduled", label: statusLabel("scheduled") },
                { value: "in_progress", label: statusLabel("in_progress") },
                { value: "completed", label: statusLabel("completed") },
                { value: "cancelled", label: statusLabel("cancelled") },
              ]}
              selected={statusFilter}
              onChange={setStatusFilter}
            />
          }
        />
      ) : (
        <AppointmentCalendar
          appointments={filtered}
          view={calendarView}
          onViewChange={setCalendarView}
          rescheduleEnabled={!isDemo && canManage}
          onReschedule={handleReschedule}
        />
      )}

      <NewAppointmentModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["appointments"] })}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
        doctors={doctors.map((d) => ({ id: d.id, full_name: d.full_name }))}
      />
    </div>
  );
};
