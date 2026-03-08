import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const revenueData = [
  { month: "Oct", revenue: 32000, expenses: 22000 },
  { month: "Nov", revenue: 38000, expenses: 24000 },
  { month: "Dec", revenue: 35000, expenses: 21000 },
  { month: "Jan", revenue: 42000, expenses: 26000 },
  { month: "Feb", revenue: 45000, expenses: 27000 },
  { month: "Mar", revenue: 48250, expenses: 28000 },
];

const patientGrowth = [
  { month: "Oct", patients: 980 },
  { month: "Nov", patients: 1050 },
  { month: "Dec", patients: 1090 },
  { month: "Jan", patients: 1150 },
  { month: "Feb", patients: 1220 },
  { month: "Mar", patients: 1284 },
];

const departmentData = [
  { name: "Cardiology", value: 28 },
  { name: "Orthopedics", value: 22 },
  { name: "Pediatrics", value: 20 },
  { name: "Dermatology", value: 15 },
  { name: "Neurology", value: 15 },
];

const doctorPerformance = [
  { name: "Dr. Sarah Ahmed", patients: 142, rating: 4.9, appointments: 38 },
  { name: "Dr. John Smith", patients: 98, rating: 4.7, appointments: 29 },
  { name: "Dr. Layla Khalid", patients: 215, rating: 4.8, appointments: 42 },
  { name: "Dr. Omar Hassan", patients: 67, rating: 4.6, appointments: 18 },
  { name: "Dr. Amira Nasser", patients: 89, rating: 4.9, appointments: 25 },
];

const COLORS = [
  "hsl(174, 62%, 34%)",
  "hsl(210, 80%, 52%)",
  "hsl(152, 60%, 40%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
];

type Tab = "revenue" | "patients" | "doctors";

export const ReportsPage = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("revenue");

  const tabItems: { key: Tab; label: string }[] = [
    { key: "revenue", label: "Revenue" },
    { key: "patients", label: "Patients" },
    { key: "doctors", label: "Doctor Performance" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("common.reports")}</h1>
      </div>

      <div className="border-b flex gap-1">
        {tabItems.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "revenue" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">Revenue vs Expenses</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenue" fill="hsl(174, 62%, 34%)" radius={[4, 4, 0, 0]} name="Revenue" />
                <Bar dataKey="expenses" fill="hsl(210, 80%, 52%)" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-card rounded-lg border p-5">
            <h3 className="font-semibold mb-4">Revenue by Department</h3>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={departmentData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {departmentData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === "patients" && (
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-4">Patient Growth</h3>
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
              <th>Doctor</th><th>Patients</th><th>Appointments (Month)</th><th>Rating</th>
            </tr></thead>
            <tbody>
              {doctorPerformance.map((doc, i) => (
                <tr key={i} className="hover:bg-muted/30 transition-colors">
                  <td className="font-medium">{doc.name}</td>
                  <td>{doc.patients}</td>
                  <td>{doc.appointments}</td>
                  <td>
                    <span className="inline-flex items-center gap-1">
                      <span className="text-warning">★</span> {doc.rating}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
