import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, Users, CalendarDays, DollarSign, Download, Printer,
  Activity, FileBarChart, Star, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";
import { generatePDF } from "@/shared/utils/pdfGenerator";
import { useQuery } from "@tanstack/react-query";
import { reportService } from "@/services/reports/report.service";
import { queryKeys } from "@/services/queryKeys";

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

  const { data: overview } = useQuery({
    queryKey: queryKeys.reports.overview(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => reportService.getOverview(),
  });

  const { data: revenueData = [] } = useQuery({
    queryKey: queryKeys.reports.revenueByMonth(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => reportService.getRevenueByMonth(6),
  });

  const { data: patientGrowth = [] } = useQuery({
    queryKey: queryKeys.reports.patientGrowth(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => reportService.getPatientGrowth(6),
  });

  const { data: appointmentTypes = [] } = useQuery({
    queryKey: queryKeys.reports.appointmentTypes(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => reportService.getAppointmentTypes(),
  });

  const { data: revenueByService = [] } = useQuery({
    queryKey: queryKeys.reports.revenueByService(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => reportService.getRevenueByService(6),
  });

  const { data: doctorPerformance = [] } = useQuery({
    queryKey: queryKeys.reports.doctorPerformance(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => reportService.getDoctorPerformance(),
  });

  const { data: appointmentStatusCounts = { scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 } } = useQuery({
    queryKey: queryKeys.reports.appointmentStatuses(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => reportService.getAppointmentStatusCounts(),
  });

  const effectiveRevenueData = isDemo ? DEMO_REVENUE : revenueData;
  const effectivePatientGrowth = isDemo ? DEMO_PATIENT_GROWTH : patientGrowth;
  const effectiveAppointmentTypes = isDemo ? DEMO_APPOINTMENT_TYPES : appointmentTypes;
  const effectiveRevenueByService = isDemo
    ? [
        { name: "Consultation", value: 38 },
        { name: "Lab", value: 24 },
        { name: "Pharmacy", value: 20 },
        { name: "Procedures", value: 18 },
      ]
    : revenueByService;

  const effectiveDoctorPerformance = isDemo
    ? [
        { name: "Dr. Sarah Ahmed", appointments: 38, rating: 4.9, completedRate: "94%", trend: true },
        { name: "Dr. John Smith", appointments: 29, rating: 4.7, completedRate: "89%", trend: false },
        { name: "Dr. Layla Khalid", appointments: 42, rating: 4.8, completedRate: "91%", trend: true },
      ]
    : doctorPerformance;

  const totalRevenue = isDemo ? 240750 : overview?.total_revenue ?? 0;
  const totalPatients = isDemo ? 1284 : overview?.total_patients ?? 0;
  const totalAppointments = isDemo ? 182 : overview?.total_appointments ?? 0;
  const avgRating = isDemo ? 4.8 : overview?.avg_doctor_rating ?? 0;

  const tabItems: { key: Tab; icon: any; label: string }[] = [
    { key: "revenue", icon: DollarSign, label: t("reports.revenue") },
    { key: "patients", icon: Users, label: t("common.patients") },
    { key: "appointments", icon: CalendarDays, label: t("common.appointments") },
    { key: "doctors", icon: Star, label: t("reports.doctorPerformance") },
  ];

  const exportReportCsv = () => {
    let csv = "";
    if (activeTab === "revenue") {
      csv = "Month,Revenue,Pending/Overdue\n" + effectiveRevenueData.map((r) => `${r.month},${r.revenue},${r.expenses}`).join("\n");
    } else if (activeTab === "patients") {
      csv = "Month,Patients\n" + effectivePatientGrowth.map((p) => `${p.month},${p.patients}`).join("\n");
    } else if (activeTab === "appointments") {
      csv = "Type,Count\n" + effectiveAppointmentTypes.map((a) => `${a.name},${a.value}`).join("\n");
    } else if (activeTab === "doctors") {
      csv = "Doctor,Appointments,Completion Rate,Rating\n" + effectiveDoctorPerformance.map((d) => `${d.name},${d.appointments},${d.completedRate},${d.rating}`).join("\n");
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${activeTab}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportReportPdf = () => {
    if (activeTab === "revenue") {
      generatePDF({
        title: t("reports.revenue"),
        subtitle: `Total: $${totalRevenue.toLocaleString()}`,
        columns: [
          { header: "Month", dataKey: "month" },
          { header: "Revenue", dataKey: "revenue" },
          { header: "Pending/Overdue", dataKey: "expenses" },
        ],
        data: effectiveRevenueData.map((r) => ({ ...r, revenue: `$${r.revenue.toLocaleString()}`, expenses: `$${r.expenses.toLocaleString()}` })),
        filename: `revenue-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } else if (activeTab === "doctors") {
      generatePDF({
        title: t("reports.doctorPerformance"),
        columns: [
          { header: "Doctor", dataKey: "name" },
          { header: "Appointments", dataKey: "appointments" },
          { header: "Completion Rate", dataKey: "completedRate" },
          { header: "Rating", dataKey: "rating" },
        ],
        data: effectiveDoctorPerformance,
        filename: `doctor-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } else if (activeTab === "patients") {
      generatePDF({
        title: t("reports.patientGrowth"),
        columns: [
          { header: "Month", dataKey: "month" },
          { header: "Total Patients", dataKey: "patients" },
        ],
        data: effectivePatientGrowth,
        filename: `patient-growth-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    } else {
      generatePDF({
        title: t("reports.byType"),
        columns: [
          { header: "Type", dataKey: "name" },
          { header: "Count", dataKey: "value" },
        ],
        data: effectiveAppointmentTypes,
        filename: `appointment-types-${new Date().toISOString().slice(0, 10)}.pdf`,
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <FileBarChart className="h-6 w-6 text-primary" />
            {t("reports.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("reports.subtitle") || "Analytics and insights for your clinic"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportReportCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportReportPdf}>
            <Printer className="h-4 w-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("billing.totalRevenue")} value={`$${totalRevenue.toLocaleString()}`} icon={DollarSign} accent="warning" trend={isDemo ? { value: 12.5, positive: true } : undefined} />
        <StatCard title={t("dashboard.totalPatients")} value={String(totalPatients)} icon={Users} accent="primary" trend={isDemo ? { value: 5.2, positive: true } : undefined} />
        <StatCard title={t("reports.totalAppointments")} value={String(totalAppointments)} icon={CalendarDays} accent="info" />
        <StatCard title={t("reports.avgDoctorRating")} value={`${avgRating.toFixed(1)} *`} icon={TrendingUp} accent="success" />
      </div>

      <div className="border-b flex gap-1 overflow-x-auto">
        {tabItems.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "revenue" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-xl border p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                {t("reports.revenueVsExpenses")}
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={effectiveRevenueData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => `$${Number(v).toLocaleString()}`} contentStyle={{ borderRadius: 8, border: "1px solid hsl(214, 20%, 90%)" }} />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(174, 62%, 34%)" radius={[6, 6, 0, 0]} name={t("reports.revenue")} />
                <Bar dataKey="expenses" fill="hsl(210, 80%, 52%)" radius={[6, 6, 0, 0]} name={t("reports.pendingOverdue")} opacity={0.7} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-semibold mb-6">{t("reports.revenueByDepartment") || "Revenue by Service"}</h3>
            <ResponsiveContainer width="100%" height={340}>
              <PieChart>
                <Pie data={effectiveRevenueByService} cx="50%" cy="50%" innerRadius={60} outerRadius={95} dataKey="value" paddingAngle={3}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {effectiveRevenueByService.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === "patients" && (
        <div className="bg-card rounded-xl border p-6">
          <h3 className="font-semibold mb-6 flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            {t("reports.patientGrowth")}
          </h3>
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={effectivePatientGrowth}>
              <defs>
                <linearGradient id="patientGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(174, 62%, 34%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(174, 62%, 34%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(214, 20%, 90%)" }} />
              <Area type="monotone" dataKey="patients" stroke="hsl(174, 62%, 34%)" fill="url(#patientGrad)" strokeWidth={2.5} dot={{ fill: "hsl(174, 62%, 34%)", r: 5, strokeWidth: 2, stroke: "white" }} name={t("common.patients")} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {activeTab === "appointments" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-xl border p-6">
            <h3 className="font-semibold mb-6">{t("reports.appointmentStatusDistribution")}</h3>
            {(() => {
              const statuses = ["scheduled", "in_progress", "completed", "cancelled"];
              const statusColors = ["hsl(38, 92%, 50%)", "hsl(210, 80%, 52%)", "hsl(152, 60%, 40%)", "hsl(0, 72%, 51%)"];
              const data = isDemo
                ? [
                    { name: t("appointments.scheduled"), value: 45, fill: statusColors[0] },
                    { name: t("appointments.inProgress"), value: 12, fill: statusColors[1] },
                    { name: t("appointments.completed"), value: 110, fill: statusColors[2] },
                    { name: t("appointments.cancelled"), value: 15, fill: statusColors[3] },
                  ]
                : statuses.map((s, i) => ({ name: s.replace("_", " "), value: appointmentStatusCounts[s as keyof typeof appointmentStatusCounts] ?? 0, fill: statusColors[i] }));
              return (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={data} layout="vertical" barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={95} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(214, 20%, 90%)" }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} name={t("reports.count")}>
                      {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </div>
          <div className="bg-card rounded-xl border p-6">
            <h3 className="font-semibold mb-6">{t("reports.byType")}</h3>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={effectiveAppointmentTypes} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3}>
                  {effectiveAppointmentTypes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === "doctors" && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b bg-muted/20">
            <h3 className="font-semibold">{t("reports.doctorPerformance")}</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr className="bg-muted/30">
                <th>{t("reports.doctor")}</th>
                <th>{t("reports.appointments")}</th>
                <th>{t("reports.completionRate")}</th>
                <th>{t("reports.rating")}</th>
                <th>{t("reports.trend") || "Trend"}</th>
              </tr>
            </thead>
            <tbody>
              {effectiveDoctorPerformance.map((doc, i) => (
                <tr key={i} className="hover:bg-muted/20 transition-colors">
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
                        {doc.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <span className="font-medium">{doc.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="font-semibold">{doc.appointments}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full max-w-[100px]">
                        <div
                          className="h-2 bg-success rounded-full transition-all"
                          style={{ width: doc.completedRate === "-" ? "0%" : doc.completedRate }}
                        />
                      </div>
                      <span className="text-sm font-medium">{doc.completedRate}</span>
                    </div>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1 text-warning">
                      <Star className="h-3.5 w-3.5 fill-warning" /> {doc.rating}
                    </span>
                  </td>
                  <td>
                    {doc.trend
                      ? <span className="inline-flex items-center gap-1 text-xs text-success"><ArrowUpRight className="h-3.5 w-3.5" /> Up</span>
                      : <span className="inline-flex items-center gap-1 text-xs text-destructive"><ArrowDownRight className="h-3.5 w-3.5" /> Down</span>
                    }
                  </td>
                </tr>
              ))}
              {effectiveDoctorPerformance.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">{t("common.noData")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
