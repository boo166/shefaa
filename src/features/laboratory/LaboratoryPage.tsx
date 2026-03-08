import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";
import { FlaskConical, Clock, CheckCircle, Plus } from "lucide-react";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { Tables } from "@/integrations/supabase/types";

type LabOrder = Tables<"lab_orders"> & {
  patients?: { full_name: string } | null;
  doctors?: { full_name: string } | null;
};

const DEMO_LABS = [
  { id: "1", patient_name: "Mohammed Al-Rashid", test_name: "Complete Blood Count (CBC)", doctor_name: "Dr. Sarah Ahmed", order_date: "2026-03-08", status: "completed", result: "Normal" },
  { id: "2", patient_name: "Fatima Hassan", test_name: "HbA1c", doctor_name: "Dr. Sarah Ahmed", order_date: "2026-03-08", status: "processing", result: null },
  { id: "3", patient_name: "Ali Mansour", test_name: "Lipid Panel", doctor_name: "Dr. John Smith", order_date: "2026-03-07", status: "completed", result: "Elevated LDL" },
  { id: "4", patient_name: "Noor Ibrahim", test_name: "Thyroid Panel", doctor_name: "Dr. Layla Khalid", order_date: "2026-03-07", status: "pending", result: null },
];

const statusVariant: Record<string, "default" | "warning" | "success"> = { pending: "default", processing: "warning", completed: "success" };

export const LaboratoryPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useRealtimeSubscription(["lab_orders"]);

  const { data: liveLabs = [], isLoading } = useSupabaseTable<LabOrder>("lab_orders", {
    select: "*, patients(full_name), doctors(full_name)",
    orderBy: { column: "order_date", ascending: false },
  });

  const displayData = isDemo
    ? DEMO_LABS
    : liveLabs.map((l) => ({
        id: l.id, patient_name: l.patients?.full_name ?? "—", test_name: l.test_name,
        doctor_name: l.doctors?.full_name ?? "—", order_date: l.order_date, status: l.status, result: l.result,
      }));

  const filtered = useMemo(() => statusFilter ? displayData.filter((l) => l.status === statusFilter) : displayData, [displayData, statusFilter]);

  const columns: Column<typeof displayData[0]>[] = [
    { key: "patient_name", header: t("appointments.patient"), searchable: true },
    { key: "test_name", header: t("laboratory.test"), searchable: true, render: (l) => <span className="font-medium">{l.test_name}</span> },
    { key: "doctor_name", header: t("laboratory.orderedBy"), searchable: true },
    { key: "order_date", header: t("common.date") },
    { key: "status", header: t("common.status"), render: (l) => <StatusBadge variant={statusVariant[l.status] ?? "default"}>{l.status}</StatusBadge> },
    { key: "result", header: t("common.result"), render: (l) => l.result ? <span className="font-medium">{l.result}</span> : <span className="text-muted-foreground">—</span> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("laboratory.title")}</h1>
        <Button><Plus className="h-4 w-4" /> {t("laboratory.newLabOrder")}</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t("laboratory.pendingOrders")} value={String(displayData.filter((l) => l.status === "pending").length)} icon={Clock} />
        <StatCard title={t("laboratory.processing")} value={String(displayData.filter((l) => l.status === "processing").length)} icon={FlaskConical} />
        <StatCard title={t("laboratory.completedToday")} value={String(displayData.filter((l) => l.status === "completed").length)} icon={CheckCircle} />
      </div>

      <DataTable
        columns={columns} data={filtered} keyExtractor={(l) => l.id} searchable isLoading={!isDemo && isLoading}
        filterSlot={
          <StatusFilter
            options={[{ value: "pending", label: "Pending" }, { value: "processing", label: "Processing" }, { value: "completed", label: "Completed" }]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />
    </div>
  );
};
