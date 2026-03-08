import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";
import { Pill, Package, AlertTriangle, Plus } from "lucide-react";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { Tables } from "@/integrations/supabase/types";

type Medication = Tables<"medications">;

const DEMO_MEDS = [
  { id: "1", name: "Lisinopril 10mg", category: "Antihypertensive", stock: 450, unit: "tablets", price: 12.5, status: "in_stock" },
  { id: "2", name: "Metformin 500mg", category: "Antidiabetic", stock: 380, unit: "tablets", price: 8.0, status: "in_stock" },
  { id: "3", name: "Amoxicillin 500mg", category: "Antibiotic", stock: 25, unit: "capsules", price: 15.0, status: "low_stock" },
  { id: "4", name: "Omeprazole 20mg", category: "Proton Pump Inhibitor", stock: 200, unit: "capsules", price: 10.0, status: "in_stock" },
  { id: "5", name: "Atorvastatin 20mg", category: "Statin", stock: 0, unit: "tablets", price: 18.0, status: "out_of_stock" },
];

const statusVariant: Record<string, "success" | "warning" | "destructive"> = { in_stock: "success", low_stock: "warning", out_of_stock: "destructive" };

export const PharmacyPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useRealtimeSubscription(["medications"]);

  const { data: liveMeds = [], isLoading } = useSupabaseTable<Medication>("medications");

  const meds = isDemo ? DEMO_MEDS : liveMeds.map((m) => ({
    id: m.id, name: m.name, category: m.category ?? "", stock: m.stock, unit: m.unit, price: Number(m.price), status: m.status,
  }));

  const filtered = useMemo(() => statusFilter ? meds.filter((m) => m.status === statusFilter) : meds, [meds, statusFilter]);

  const columns: Column<typeof meds[0]>[] = [
    { key: "name", header: t("pharmacy.medication"), searchable: true, render: (m) => <span className="font-medium">{m.name}</span> },
    { key: "category", header: t("common.category"), searchable: true },
    { key: "stock", header: t("common.stock"), render: (m) => `${m.stock} ${m.unit}` },
    { key: "price", header: t("common.price"), render: (m) => `$${m.price.toFixed(2)}` },
    { key: "status", header: t("common.status"), render: (m) => <StatusBadge variant={statusVariant[m.status] ?? "default"}>{m.status.replace(/_/g, " ")}</StatusBadge> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("pharmacy.title")}</h1>
        <Button><Plus className="h-4 w-4" /> {t("pharmacy.addMedication")}</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t("pharmacy.totalMedications")} value={String(meds.length)} icon={Pill} />
        <StatCard title={t("pharmacy.lowStockItems")} value={String(meds.filter((m) => m.status === "low_stock").length)} icon={AlertTriangle} />
        <StatCard title={t("pharmacy.inventoryValue")} value={`$${meds.reduce((s, m) => s + m.price * m.stock, 0).toLocaleString()}`} icon={Package} />
      </div>

      <DataTable
        columns={columns} data={filtered} keyExtractor={(m) => m.id} searchable isLoading={!isDemo && isLoading}
        filterSlot={
          <StatusFilter
            options={[{ value: "in_stock", label: "In Stock" }, { value: "low_stock", label: "Low Stock" }, { value: "out_of_stock", label: "Out of Stock" }]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />
    </div>
  );
};
