import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
} from "recharts";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { Tables } from "@/integrations/supabase/types";
import { TrendingUp, Users, CalendarDays, DollarSign, Download, Printer } from "lucide-react";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";

const COLORS = [
  "hsl(174, 62%, 34%)", "hsl(210, 80%, 52%)", "hsl(152, 60%, 40%)",
  "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)",
];

const DEMO_REVENUE = [
  { month: "Oct", revenue: 32000, expenses: 22000 },
  { month: "Nov", revenue: 38000, expenses: 24000 },
  { month: "Dec", revenue: 35000, expenses: 21000 },
  { month: "Jan", revenue: 42000, expenses: 26000 },
  { month: "Feb", revenue: 45000, expenses: 27000 },
  { month: "Mar", revenue: 48250, expenses: 28000 },
];

const DEMO_PATIENT_GROWTH = [
  { month: "Oct", patients: 980 }, { month: "Nov", patients: 1050 },
  { month: "Dec", patients: 1090 }, { month: "Jan", patients: 1150 },
  { month: "Feb", patients: 1220 }, { month: "Mar", patients: 1284 },
];

const DEMO_APPOINTMENT_TYPES = [
  { name: "Checkup", value: 42 }, { name: "Follow-up", value: 28 },
  { name: "Consultation", value: 20 }, { name: "Emergency", value: 10 },
];

type Tab = "revenue" | "patients" | "doctors" | "appointments";

export const ReportsPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [activeTab, setActiveTab] = useState<Tab>("revenue");

  const { data: invoices = [] } = useSupabaseTable<Tables<"invoices">>("invoices");
  const { data: patients = [] } = useSupabaseTable<Tables<"patients">>("patients");
  const { data: doctors = [] } = useSupabaseTable<Tables<"doctors">>("doctors");
  const { data: appointments = [] } = useSupabaseTable<Tables<"appointments">>("appointments");

  // Revenue data: group invoices by month
  const revenueData = useMemo(() => {
    if (isDemo) return DEMO_REVENUE;
    const months: Record<string, { revenue: number; expenses: number }> = {};
    invoices.forEach((inv) => {
      const d = new Date(inv.invoice_date);
      const key = d.toLocaleString("en", { month: "short" });
      if (!months[key]) months[key] = { revenue: 0, expenses: 0 };
      if (inv.status === "paid") months[key].revenue += Number(inv.amount);
      else months[key].expenses += Number(inv.amount);
    });
    return Object.entries(months).map(([month, vals]) => ({ month, ...vals }));
  }, [invoices, isDemo]);

  // Patient growth: group by month of created_at
  const patientGrowth = useMemo(() => {
    if (isDemo) return DEMO_PATIENT_GROWTH;
    const sorted = [...patients].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const months: Record<string, number> = {};
    sorted.forEach((p, i) => {
      const key = new Date(p.created_at).toLocaleString("en", { month: "short" });
      months[key] = i + 1;
    });
    return Object.entries(months).map(([month, count]) => ({ month, patients: count }));
  }, [patients, isDemo]);

  // Appointment type distribution
  const appointmentTypes = useMemo(() => {
    if (isDemo) return DEMO_APPOINTMENT_TYPES;
    const types: Record<string, number> = {};
    appointments.forEach((a) => { types[a.type] = (types[a.type] || 0) + 1; });
    return Object.entries(types).map(([name, value]) => ({ name: name.replace("_", " "), value }));
  }, [appointments, isDemo]);

  // Doctor performance
  const doctorPerformance = useMemo(() => {
    if (isDemo) return [
      { name: "Dr. Sarah Ahmed", appointments: 38, rating: 4.9, completedRate: "94%" },
      { name: "Dr. John Smith", appointments: 29, rating: 4.7, completedRate: "89%" },
      { name: "Dr. Layla Khalid", appointments: 42, rating: 4.8, completedRate: "91%" },
    ];
    return doctors.map((doc) => {
      const docAppts = appointments.filter((a) => a.doctor_id === doc.id);
      const completed = docAppts.filter((a) => a.status === "completed").length;
      return {
        name: doc.full_name,
        appointments: docAppts.length,
        rating: Number(doc.rating) || 0,
        completedRate: docAppts.length ? `${Math.round((completed / docAppts.length) * 100)}%` : "—",
      };
    }).sort((a, b) => b.appointments - a.appointments);
  }, [doctors, appointments, isDemo]);

  // Summary stats
  const totalRevenue = isDemo ? 240750 : invoices.filter((i) => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
  const totalPatients = isDemo ? 1284 : patients.length;
  const totalAppointments = isDemo ? 182 : appointments.length;
  const avgRating = isDemo ? 4.8 : (doctors.reduce((s, d) => s + Number(d.rating || 0), 0) / (doctors.length || 1));

  const tabItems: { key: Tab; label: string }[] = [
    { key: "revenue", label: t("reports.revenue") },
    { key: "patients", label: t("common.patients") },
    { key: "appointments", label: t("common.appointments") },
    { key: "doctors", label: t("reports.doctorPerformance") },
  ];

  const exportReportCsv = () => {
    let csv = "";
    if (activeTab === "revenue") {
      csv = "Month,Revenue,Pending/Overdue\n" + revenueData.map((r) => `${r.month},${r.revenue},${r.expenses}`).join("\n");
    } else if (activeTab === "patients") {
      csv = "Month,Patients\n" + patientGrowth.map((p) => `${p.month},${p.patients}`).join("\n");
    } else if (activeTab === "appointments") {
      csv = "Type,Count\n" + appointmentTypes.map((a) => `${a.name},${a.value}`).join("\n");
    } else if (activeTab === "doctors") {
      csv = "Doctor,Appointments,Completion Rate,Rating\n" + doctorPerformance.map((d) => `${d.name},${d.appointments},${d.completedRate},${d.rating}`).join("\n");
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("reports.title")}</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportReportCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> {t("common.print")}
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("billing.totalRevenue")} value={`$${totalRevenue.toLocaleString()}`} icon={DollarSign} />
        <StatCard title={t("dashboard.totalPatients")} value={String(totalPatients)} icon={Users} />
        <StatCard title={t("reports.totalAppointments")} value={String(totalAppointments)} icon={CalendarDays} />
        <StatCard title={t("reports.avgDoctorRating")} value={`${avgRating.toFixed(1)} ★`} icon={TrendingUp} />
      </div>

      <div className="border-b flex gap-1">
        {tabItems.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn("px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >{tab.label}</button>
        ))}
      </div>

      {activeTab === "revenue" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">{t("reports.revenueVsExpenses")}</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(174, 62%, 34%)" radius={[4, 4, 0, 0]} name={t("reports.revenue")} />
                <Bar dataKey="expenses" fill="hsl(210, 80%, 52%)" radius={[4, 4, 0, 0]} name={t("reports.pendingOverdue")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">{t("reports.revenueByDepartment")}</h3>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={appointmentTypes} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {appointmentTypes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === "patients" && (
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">{t("reports.patientGrowth")}</h3>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={patientGrowth}>
              <defs>
                <linearGradient id="patientGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(174, 62%, 34%)" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="hsl(174, 62%, 34%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Area type="monotone" dataKey="patients" stroke="hsl(174, 62%, 34%)" fill="url(#patientGrad)" strokeWidth={3} dot={{ fill: "hsl(174, 62%, 34%)", r: 5 }} name={t("common.patients")} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {activeTab === "appointments" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">{t("reports.appointmentStatusDistribution")}</h3>
            {(() => {
              const statuses = ["scheduled", "in_progress", "completed", "cancelled"];
              const data = isDemo
                ? [
                    { name: t("appointments.scheduled"), value: 45 },
                    { name: t("appointments.inProgress"), value: 12 },
                    { name: t("appointments.completed"), value: 110 },
                    { name: t("appointments.cancelled"), value: 15 },
                  ]
                : statuses.map((s) => ({ name: s.replace("_", " "), value: appointments.filter((a) => a.status === s).length }));
              return (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(174, 62%, 34%)" radius={[0, 4, 4, 0]} name={t("reports.count")} />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
          <div className="bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">{t("reports.byType")}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={appointmentTypes} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value">
                  {appointmentTypes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === "doctors" && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="data-table">
            <thead><tr className="bg-muted/50">
              <th>{t("reports.doctor")}</th>
              <th>{t("reports.appointments")}</th>
              <th>{t("reports.completionRate")}</th>
              <th>{t("reports.rating")}</th>
            </tr></thead>
            <tbody>
              {doctorPerformance.map((doc, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="font-medium">{doc.name}</td>
                  <td>{doc.appointments}</td>
                  <td>{doc.completedRate}</td>
                  <td><span className="inline-flex items-center gap-1"><span className="text-warning">★</span> {doc.rating}</span></td>
                </tr>
              ))}
              {doctorPerformance.length === 0 && (
                <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">{t("common.noData")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
