import { useMemo, useState, useEffect } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { CalendarPlus, CheckCircle, XCircle, Play, CalendarDays, List } from "lucide-react";
import { formatDate } from "@/shared/utils/formatDate";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { AppointmentCalendar, AppointmentCalendarItem, AppointmentCalendarView } from "./AppointmentCalendar";
import { appointmentService } from "@/services/appointments/appointment.service";
import { patientService } from "@/services/patients/patient.service";
import { doctorService } from "@/services/doctors/doctor.service";
import { queryKeys } from "@/services/queryKeys";
import type { AppointmentWithPatientDoctor } from "@/domain/appointment/appointment.types";
import type { Patient } from "@/domain/patient/patient.types";
import type { Doctor } from "@/domain/doctor/doctor.types";

type AppointmentRow = AppointmentWithPatientDoctor;

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

function getCalendarRange(cursor: Date, view: AppointmentCalendarView) {
  if (view === "week") {
    const start = startOfWeek(cursor);
    const end = addDays(start, 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const end = addDays(start, 41);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export const AppointmentsPage = () => {
  const { t, locale, calendarType } = useI18n();
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const canManage = hasPermission("manage_appointments");

  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [calendarView, setCalendarView] = useState<AppointmentCalendarView>("month");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  });
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 25;

  useRealtimeSubscription(["appointments"]);

  const { data: listPage, isLoading: loadingList } = useQuery({
    queryKey: queryKeys.appointments.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
    }),
    queryFn: async () => appointmentService.listPagedWithRelations({
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
    }),
    enabled: !isDemo && viewMode === "list" && !!user?.tenantId,
  });

  const { start: calendarStart, end: calendarEnd } = getCalendarRange(calendarCursor, calendarView);
  const { data: calendarAppointments = [] } = useQuery({
    queryKey: queryKeys.appointments.calendar({
      tenantId: user?.tenantId,
      start: calendarStart.toISOString(),
      end: calendarEnd.toISOString(),
    }),
    queryFn: async () => appointmentService.listByDateRange(
      calendarStart.toISOString(),
      calendarEnd.toISOString(),
    ),
    enabled: !isDemo && viewMode === "calendar" && !!user?.tenantId,
  });

  const { data: patientPage } = useQuery({
    queryKey: queryKeys.patients.list({ tenantId: user?.tenantId, page: 1, pageSize: 500 }),
    queryFn: async () => patientService.listPaged({ page: 1, pageSize: 500, sort: { column: "full_name", ascending: true } }),
    enabled: !!user?.tenantId && !isDemo,
  });

  const { data: doctorPage } = useQuery({
    queryKey: queryKeys.doctors.list({ tenantId: user?.tenantId, page: 1, pageSize: 500 }),
    queryFn: async () => doctorService.listPaged({ page: 1, pageSize: 500, sort: { column: "full_name", ascending: true } }),
    enabled: !!user?.tenantId && !isDemo,
  });

  const patients: Patient[] = patientPage?.data ?? [];
  const doctors: Doctor[] = doctorPage?.data ?? [];

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm, viewMode]);

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

  const demoFiltered = useMemo(() => {
    if (!isDemo) return DEMO_APPOINTMENTS;
    const q = searchTerm.trim().toLowerCase();
    return DEMO_APPOINTMENTS.filter((a) => {
      if (statusFilter && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.patient_name.toLowerCase().includes(q) ||
        a.doctor_name.toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q)
      );
    });
  }, [isDemo, statusFilter, searchTerm]);

  const listAppointments = listPage?.data ?? [];
  const totalAppointments = listPage?.count ?? 0;

  const listDisplayData: AppointmentCalendarItem[] = isDemo
    ? demoFiltered.slice((page - 1) * pageSize, page * pageSize)
    : listAppointments.map((a) => ({
        id: a.id,
        patient_name: a.patients?.full_name ?? "—",
        doctor_name: a.doctors?.full_name ?? "—",
        appointment_date: a.appointment_date,
        type: a.type,
        status: a.status,
      }));

  const calendarDisplayData: AppointmentCalendarItem[] = isDemo
    ? DEMO_APPOINTMENTS
    : calendarAppointments.map((a) => ({
        id: a.id,
        patient_name: a.patients?.full_name ?? "—",
        doctor_name: a.doctors?.full_name ?? "—",
        appointment_date: a.appointment_date,
        type: a.type,
        status: a.status,
      }));

  const calendarFiltered = useMemo(
    () => (statusFilter ? calendarDisplayData.filter((a) => a.status === statusFilter) : calendarDisplayData),
    [calendarDisplayData, statusFilter],
  );

  const totalForList = isDemo ? demoFiltered.length : totalAppointments;

  const { data: statusCounts = { scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 } } = useQuery({
    queryKey: queryKeys.appointments.statusCounts(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: async () => appointmentService.countByStatus(),
  });

  const demoStatusCounts = DEMO_APPOINTMENTS.reduce(
    (acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const effectiveStatusCounts = isDemo ? demoStatusCounts : statusCounts;

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    if (isDemo) return;
    try {
      await appointmentService.update(id, { status: newStatus as AppointmentRow["status"] });
      toast({ title: t("appointments.appointmentStatusUpdated"), description: statusLabel(newStatus) });
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.root(user?.tenantId) });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  const handleReschedule = async (id: string, newAppointmentDate: string) => {
    if (isDemo) return;
    try {
      await appointmentService.update(id, { appointment_date: newAppointmentDate });
      toast({ title: t("appointments.appointmentRescheduled") });
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.root(user?.tenantId) });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  const columns: Column<(typeof listDisplayData)[0]>[] = [
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
      render: (a) => formatDate(a.appointment_date, locale, "datetime", calendarType),
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
            <p className="text-2xl font-bold">{effectiveStatusCounts[status] ?? 0}</p>
            <p className="text-sm text-muted-foreground">{statusLabel(status)}</p>
          </div>
        ))}
      </div>

      {viewMode === "list" ? (
        <DataTable
          columns={columns}
          data={listDisplayData}
          keyExtractor={(a) => a.id}
          searchable
          serverSearch
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          isLoading={!isDemo && loadingList}
          exportFileName="appointments"
          page={page}
          pageSize={pageSize}
          total={totalForList}
          onPageChange={setPage}
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
          appointments={calendarFiltered}
          view={calendarView}
          onViewChange={setCalendarView}
          cursor={calendarCursor}
          onCursorChange={setCalendarCursor}
          rescheduleEnabled={!isDemo && canManage}
          onReschedule={handleReschedule}
        />
      )}

      <NewAppointmentModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: queryKeys.appointments.root(user?.tenantId) })}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
        doctors={doctors.map((d) => ({ id: d.id, full_name: d.full_name }))}
      />
    </div>
  );
};
