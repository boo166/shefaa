import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Users, CalendarDays, Stethoscope, DollarSign } from "lucide-react";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/core/auth/authStore";
import { Tables } from "@/integrations/supabase/types";
import { formatDate, formatCurrency } from "@/shared/utils/formatDate";

type Appointment = Tables<"appointments"> & {
  patients?: { full_name: string } | null;
  doctors?: { full_name: string } | null;
};

const statusVariant: Record<string, "success" | "info" | "default" | "destructive"> = {
  completed: "success", in_progress: "info", scheduled: "default", cancelled: "destructive",
};

const DEMO_APPOINTMENTS = [
  { id: "1", patient: "Mohammed Al-Rashid", doctor: "Dr. Sarah Ahmed", time: "09:00 AM", status: "completed" },
  { id: "2", patient: "Fatima Hassan", doctor: "Dr. John Smith", time: "10:30 AM", status: "in_progress" },
  { id: "3", patient: "Ali Mansour", doctor: "Dr. Sarah Ahmed", time: "11:00 AM", status: "scheduled" },
  { id: "4", patient: "Noor Ibrahim", doctor: "Dr. Layla Khalid", time: "02:00 PM", status: "scheduled" },
];

export const DashboardPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";

  const { data: patients = [] } = useSupabaseTable<Tables<"patients">>("patients");
  const { data: doctors = [] } = useSupabaseTable<Tables<"doctors">>("doctors");
  const { data: appointments = [] } = useSupabaseTable<Appointment>("appointments", {
    select: "*, patients(full_name), doctors(full_name)",
    orderBy: { column: "appointment_date", ascending: false },
  });
  const { data: invoices = [] } = useSupabaseTable<Tables<"invoices">>("invoices");

  const totalPatients = isDemo ? "1,284" : String(patients.length);
  const todayAppointments = isDemo ? "24" : String(appointments.length);
  const activeDoctors = isDemo ? "18" : String(doctors.filter((d) => d.status === "available").length);
  const revenue = isDemo ? "$48,250" : `$${invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0).toLocaleString()}`;

  const recentList = isDemo
    ? DEMO_APPOINTMENTS
    : appointments.slice(0, 5).map((a) => ({
        id: a.id,
        patient: a.patients?.full_name ?? "—",
        doctor: a.doctors?.full_name ?? "—",
        time: new Date(a.appointment_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: a.status,
      }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("dashboard.title")}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("dashboard.totalPatients")} value={totalPatients} icon={Users} />
        <StatCard title={t("dashboard.todayAppointments")} value={todayAppointments} icon={CalendarDays} />
        <StatCard title={t("dashboard.activeDoctors")} value={activeDoctors} icon={Stethoscope} />
        <StatCard title={t("dashboard.monthlyRevenue")} value={revenue} icon={DollarSign} />
      </div>

      <div className="bg-card rounded-lg border">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">{t("dashboard.recentAppointments")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr className="bg-muted/50">
                <th>{t("appointments.patient")}</th>
                <th>{t("appointments.doctor")}</th>
                <th>{t("appointments.dateTime")}</th>
                <th>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {recentList.map((apt) => (
                <tr key={apt.id} className="hover:bg-muted/30 transition-colors">
                  <td className="font-medium">{apt.patient}</td>
                  <td>{apt.doctor}</td>
                  <td className="text-muted-foreground">{apt.time}</td>
                  <td>
                    <StatusBadge variant={statusVariant[apt.status] ?? "default"}>
                      {apt.status === "completed" ? t("appointments.completed")
                        : apt.status === "in_progress" ? t("appointments.inProgress")
                        : apt.status === "cancelled" ? t("appointments.cancelled")
                        : t("appointments.scheduled")}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
              {recentList.length === 0 && (
                <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">{t("common.noData")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
