import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Users, CalendarDays, Stethoscope, DollarSign, Activity } from "lucide-react";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { useAuth } from "@/core/auth/authStore";
import { Tables } from "@/integrations/supabase/types";
import { formatDate, formatCurrency } from "@/shared/utils/formatDate";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Appointment = Tables<"appointments"> & {
  patients?: { full_name: string } | null;
  doctors?: { full_name: string } | null;
};

type DateRange = "today" | "week" | "month" | "all";

const statusVariant: Record<string, "success" | "info" | "default" | "destructive"> = {
  completed: "success",
  in_progress: "info",
  scheduled: "default",
  cancelled: "destructive",
};

const COLORS = [
  "hsl(174, 62%, 34%)", "hsl(210, 80%, 52%)", "hsl(152, 60%, 40%)",
  "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)",
];

const DEMO_APPOINTMENTS = [
  { id: "1", patient: "Mohammed Al-Rashid", doctor: "Dr. Sarah Ahmed", time: "09:00 AM", status: "completed" },
  { id: "2", patient: "Fatima Hassan", doctor: "Dr. John Smith", time: "10:30 AM", status: "in_progress" },
  { id: "3", patient: "Ali Mansour", doctor: "Dr. Sarah Ahmed", time: "11:00 AM", status: "scheduled" },
  { id: "4", patient: "Noor Ibrahim", doctor: "Dr. Layla Khalid", time: "02:00 PM", status: "scheduled" },
];

const DEMO_REVENUE_TREND = [
  { month: "Oct", revenue: 32000 }, { month: "Nov", revenue: 38000 },
  { month: "Dec", revenue: 35000 }, { month: "Jan", revenue: 42000 },
  { month: "Feb", revenue: 45000 }, { month: "Mar", revenue: 48250 },
];

const DEMO_APPT_TYPES = [
  { name: "Checkup", value: 42 }, { name: "Follow-up", value: 28 },
  { name: "Consultation", value: 20 }, { name: "Emergency", value: 10 },
];

function getDateRangeStart(range: DateRange): Date | null {
  const now = new Date();
  switch (range) {
    case "today": return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week": { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    case "month": { const d = new Date(now); d.setMonth(d.getMonth() - 1); return d; }
    case "all": return null;
  }
}

export const DashboardPage = () => {
  const { t, locale, calendarType } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [dateRange, setDateRange] = useState<DateRange>("month");

  const { data: patients = [] } = useSupabaseTable<Tables<"patients">>("patients");
  const { data: doctors = [] } = useSupabaseTable<Tables<"doctors">>("doctors");
  const { data: appointments = [] } = useSupabaseTable<Appointment>("appointments", {
    select: "*, patients(full_name), doctors(full_name)",
    orderBy: { column: "appointment_date", ascending: false },
  });
  const { data: invoices = [] } = useSupabaseTable<Tables<"invoices">>("invoices");

  const rangeStart = getDateRangeStart(dateRange);

  const filteredAppointments = useMemo(() => {
    if (!rangeStart) return appointments;
    return appointments.filter((a) => new Date(a.appointment_date) >= rangeStart);
  }, [appointments, rangeStart]);

  const filteredInvoices = useMemo(() => {
    if (!rangeStart) return invoices;
    return invoices.filter((i) => new Date(i.invoice_date) >= rangeStart);
  }, [invoices, rangeStart]);

  const totalPatients = isDemo ? "1,284" : String(patients.length);
  const periodAppointments = isDemo ? "24" : String(filteredAppointments.length);
  const activeDoctors = isDemo ? "18" : String(doctors.filter((d) => d.status === "available").length);
  const revenue = isDemo
    ? formatCurrency(48250, locale)
    : formatCurrency(filteredInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0), locale);

  const recentList = isDemo
    ? DEMO_APPOINTMENTS
    : filteredAppointments.slice(0, 5).map((a) => ({
        id: a.id,
        patient: a.patients?.full_name ?? "—",
        doctor: a.doctors?.full_name ?? "—",
        time: formatDate(a.appointment_date, locale, "time", calendarType),
        status: a.status,
      }));

  const revenueTrend = useMemo(() => {
    if (isDemo) return DEMO_REVENUE_TREND;
    const months: Record<string, number> = {};
    invoices.forEach((inv) => {
      if (inv.status === "paid") {
        const key = new Date(inv.invoice_date).toLocaleString("en", { month: "short" });
        months[key] = (months[key] || 0) + Number(inv.amount);
      }
    });
    return Object.entries(months).map(([month, revenue]) => ({ month, revenue }));
  }, [invoices, isDemo]);

  const apptTypes = useMemo(() => {
    if (isDemo) return DEMO_APPT_TYPES;
    const types: Record<string, number> = {};
    appointments.forEach((a) => { types[a.type] = (types[a.type] || 0) + 1; });
    return Object.entries(types).map(([name, value]) => ({ name: name.replace("_", " "), value }));
  }, [appointments, isDemo]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">{t("dashboard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("dashboard.welcomeBack") || "Welcome back"}, {user?.name?.split(" ")[0] ?? ""}</p>
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t("dashboard.rangeToday")}</SelectItem>
            <SelectItem value="week">{t("dashboard.rangeWeek")}</SelectItem>
            <SelectItem value="month">{t("dashboard.rangeMonth")}</SelectItem>
            <SelectItem value="all">{t("dashboard.rangeAll")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("dashboard.totalPatients")} value={totalPatients} icon={Users} accent="primary" trend={isDemo ? { value: 5.2, positive: true } : undefined} />
        <StatCard title={t("dashboard.periodAppointments")} value={periodAppointments} icon={CalendarDays} accent="info" trend={isDemo ? { value: 12, positive: true } : undefined} />
        <StatCard title={t("dashboard.activeDoctors")} value={activeDoctors} icon={Stethoscope} accent="success" />
        <StatCard title={t("dashboard.periodRevenue")} value={revenue} icon={DollarSign} accent="warning" trend={isDemo ? { value: 7.1, positive: true } : undefined} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Trend */}
        <div className="lg:col-span-2 bg-card rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              {t("reports.revenue") || "Revenue"} {t("reports.trend") || "Trend"}
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={revenueTrend}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(174, 62%, 34%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(174, 62%, 34%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
              <Area type="monotone" dataKey="revenue" stroke="hsl(174, 62%, 34%)" fill="url(#revGrad)" strokeWidth={2.5} dot={{ fill: "hsl(174, 62%, 34%)", r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Appointment Types Pie */}
        <div className="bg-card rounded-xl border p-5">
          <h3 className="font-semibold mb-4">{t("reports.byType") || "By Type"}</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={apptTypes} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                {apptTypes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Appointments */}
      <div className="bg-card rounded-xl border">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">{t("dashboard.recentAppointments")}</h2>
          <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">{recentList.length} {t("common.appointments").toLowerCase()}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr className="bg-muted/30">
                <th>{t("appointments.patient")}</th>
                <th>{t("appointments.doctor")}</th>
                <th>{t("appointments.dateTime")}</th>
                <th>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {recentList.map((apt) => (
                <tr key={apt.id} className="hover:bg-muted/20 transition-colors">
                  <td className="font-medium">{apt.patient}</td>
                  <td>{apt.doctor}</td>
                  <td className="text-muted-foreground">{apt.time}</td>
                  <td>
                    <StatusBadge variant={statusVariant[apt.status] ?? "default"}>
                      {apt.status === "completed"
                        ? t("appointments.completed")
                        : apt.status === "in_progress"
                          ? t("appointments.inProgress")
                          : apt.status === "cancelled"
                            ? t("appointments.cancelled")
                            : t("appointments.scheduled")}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
              {recentList.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">{t("common.noData")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
