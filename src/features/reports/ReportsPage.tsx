import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { Tables } from "@/integrations/supabase/types";

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

const DEMO_DEPARTMENT_DATA = [
  { name: "Cardiology", value: 28 }, { name: "Orthopedics", value: 22 },
  { name: "Pediatrics", value: 20 }, { name: "Dermatology", value: 15 }, { name: "Neurology", value: 15 },
];

type Tab = "revenue" | "patients" | "doctors";

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

  // Department data: group doctors by specialty
  const departmentData = useMemo(() => {
    if (isDemo) return DEMO_DEPARTMENT_DATA;
    const deps: Record<string, number> = {};
    doctors.forEach((d) => { deps[d.specialty] = (deps[d.specialty] || 0) + 1; });
    return Object.entries(deps).map(([name, value]) => ({ name, value }));
  }, [doctors, isDemo]);

  // Doctor performance
  const doctorPerformance = useMemo(() => {
    if (isDemo) return [
      { name: "Dr. Sarah Ahmed", patients: 142, rating: 4.9, appointments: 38 },
      { name: "Dr. John Smith", patients: 98, rating: 4.7, appointments: 29 },
      { name: "Dr. Layla Khalid", patients: 215, rating: 4.8, appointments: 42 },
    ];
    return doctors.map((doc) => ({
      name: doc.full_name,
      patients: 0,
      rating: Number(doc.rating) || 0,
      appointments: appointments.filter((a) => a.doctor_id === doc.id).length,
    }));
  }, [doctors, appointments, isDemo]);

  const tabItems: { key: Tab; label: string }[] = [
    { key: "revenue", label: t("reports.revenue") },
    { key: "patients", label: t("common.patients") },
    { key: "doctors", label: t("reports.doctorPerformance") },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("reports.title")}</h1>
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
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(174, 62%, 34%)" radius={[4, 4, 0, 0]} name={t("reports.revenue")} />
                <Bar dataKey="expenses" fill="hsl(210, 80%, 52%)" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">{t("reports.revenueByDepartment")}</h3>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={departmentData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {departmentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
            <LineChart data={patientGrowth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="patients" stroke="hsl(174, 62%, 34%)" strokeWidth={3} dot={{ fill: "hsl(174, 62%, 34%)", r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {activeTab === "doctors" && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="data-table">
            <thead><tr className="bg-muted/50">
              <th>{t("reports.doctor")}</th><th>{t("reports.patientsCount")}</th><th>{t("reports.appointmentsMonth")}</th><th>{t("reports.rating")}</th>
            </tr></thead>
            <tbody>
              {doctorPerformance.map((doc, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="font-medium">{doc.name}</td>
                  <td>{doc.patients}</td>
                  <td>{doc.appointments}</td>
                  <td><span className="inline-flex items-center gap-1"><span className="text-warning">★</span> {doc.rating}</span></td>
                </tr>
              ))}
              {doctorPerformance.length === 0 && (
                <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
