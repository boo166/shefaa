import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { CalendarPlus } from "lucide-react";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { NewAppointmentModal } from "./NewAppointmentModal";
import { useQueryClient } from "@tanstack/react-query";
import { Tables } from "@/integrations/supabase/types";

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

export const AppointmentsPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useRealtimeSubscription(["appointments"]);

  const { data: liveAppointments = [], isLoading } = useSupabaseTable<Appointment>("appointments", {
    select: "*, patients(full_name), doctors(full_name)",
    orderBy: { column: "appointment_date", ascending: false },
  });

  const { data: patients = [] } = useSupabaseTable<Tables<"patients">>("patients");
  const { data: doctors = [] } = useSupabaseTable<Tables<"doctors">>("doctors");

  const displayData = isDemo
    ? DEMO_APPOINTMENTS
    : liveAppointments.map((a) => ({
        id: a.id, patient_name: a.patients?.full_name ?? "—", doctor_name: a.doctors?.full_name ?? "—",
        appointment_date: a.appointment_date, type: a.type, status: a.status,
      }));

  const filtered = useMemo(() => statusFilter ? displayData.filter((a) => a.status === statusFilter) : displayData, [displayData, statusFilter]);

  const statusCounts = displayData.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  const columns: Column<typeof displayData[0]>[] = [
    { key: "patient_name", header: t("appointments.patient"), searchable: true, render: (a) => <span className="font-medium">{a.patient_name}</span> },
    { key: "doctor_name", header: t("appointments.doctor"), searchable: true },
    { key: "appointment_date", header: t("appointments.dateTime") },
    { key: "type", header: t("appointments.type"), render: (a) => <StatusBadge variant="default">{a.type}</StatusBadge> },
    { key: "status", header: t("common.status"), render: (a) => <StatusBadge variant={(statusVariant as any)[a.status] ?? "default"}>{a.status.replace("_", " ")}</StatusBadge> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("appointments.title")}</h1>
        <PermissionGuard permission="manage_appointments">
          <Button onClick={() => setShowModal(true)}><CalendarPlus className="h-4 w-4" />{t("appointments.newAppointment")}</Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(["scheduled", "in_progress", "completed", "cancelled"] as const).map((status) => (
          <div key={status} className="stat-card text-center cursor-pointer hover:ring-2 ring-primary/30 transition-all" onClick={() => setStatusFilter(statusFilter === status ? null : status)}>
            <p className="text-2xl font-bold">{statusCounts[status] ?? 0}</p>
            <p className="text-sm text-muted-foreground capitalize">{status.replace("_", " ")}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns} data={filtered} keyExtractor={(a) => a.id} searchable isLoading={!isDemo && isLoading} exportFileName="appointments"
        filterSlot={
          <StatusFilter
            options={[
              { value: "scheduled", label: "Scheduled" },
              { value: "in_progress", label: "In Progress" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      <NewAppointmentModal
        open={showModal} onClose={() => setShowModal(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["appointments"] })}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
        doctors={doctors.map((d) => ({ id: d.id, full_name: d.full_name }))}
      />
    </div>
  );
};
