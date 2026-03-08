import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";
import { FlaskConical, Clock, CheckCircle, Plus } from "lucide-react";

interface LabOrder {
  id: string;
  patient: string;
  test: string;
  orderedBy: string;
  date: string;
  status: "pending" | "processing" | "completed";
  result?: string;
}

const DEMO_LABS: LabOrder[] = [
  { id: "LAB-001", patient: "Mohammed Al-Rashid", test: "Complete Blood Count (CBC)", orderedBy: "Dr. Sarah Ahmed", date: "2026-03-08", status: "completed", result: "Normal" },
  { id: "LAB-002", patient: "Fatima Hassan", test: "HbA1c", orderedBy: "Dr. Sarah Ahmed", date: "2026-03-08", status: "processing" },
  { id: "LAB-003", patient: "Ali Mansour", test: "Lipid Panel", orderedBy: "Dr. John Smith", date: "2026-03-07", status: "completed", result: "Elevated LDL" },
  { id: "LAB-004", patient: "Noor Ibrahim", test: "Thyroid Panel (TSH, T3, T4)", orderedBy: "Dr. Layla Khalid", date: "2026-03-07", status: "pending" },
  { id: "LAB-005", patient: "Khalid Omar", test: "Urinalysis", orderedBy: "Dr. John Smith", date: "2026-03-06", status: "completed", result: "Normal" },
  { id: "LAB-006", patient: "Sara Al-Fahad", test: "Liver Function Test", orderedBy: "Dr. Sarah Ahmed", date: "2026-03-06", status: "processing" },
];

const statusVariant = { pending: "default", processing: "warning", completed: "success" } as const;

export const LaboratoryPage = () => {
  const { t } = useI18n();

  const columns: Column<LabOrder>[] = [
    { key: "id", header: "Order #", render: (l) => <span className="font-medium">{l.id}</span> },
    { key: "patient", header: t("appointments.patient") },
    { key: "test", header: "Test" },
    { key: "orderedBy", header: "Ordered By" },
    { key: "date", header: t("common.date") },
    { key: "status", header: t("common.status"), render: (l) => <StatusBadge variant={statusVariant[l.status]}>{l.status}</StatusBadge> },
    { key: "result", header: "Result", render: (l) => l.result ? <span className="font-medium">{l.result}</span> : <span className="text-muted-foreground">—</span> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("common.laboratory")}</h1>
        <Button><Plus className="h-4 w-4" /> New Lab Order</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Pending Orders" value="12" icon={Clock} />
        <StatCard title="Processing" value="8" icon={FlaskConical} />
        <StatCard title="Completed Today" value="24" icon={CheckCircle} />
      </div>

      <DataTable columns={columns} data={DEMO_LABS} keyExtractor={(l) => l.id} />
    </div>
  );
};
