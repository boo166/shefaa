import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";
import { Pill, Package, AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { Tables } from "@/integrations/supabase/types";
import { AddMedicationModal } from "./AddMedicationModal";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useRealtimeSubscription(["medications"]);

  const { data: liveMeds = [], isLoading } = useSupabaseTable<Medication>("medications");

  const meds = isDemo ? DEMO_MEDS : liveMeds.map((m) => ({
    id: m.id, name: m.name, category: m.category ?? "", stock: m.stock, unit: m.unit, price: Number(m.price), status: m.status,
  }));

  const filtered = useMemo(() => statusFilter ? meds.filter((m) => m.status === statusFilter) : meds, [meds, statusFilter]);

  const handleDelete = async () => {
    if (!deleteId || isDemo) return;
    setDeleting(true);
    const { error } = await supabase.from("medications").delete().eq("id", deleteId);
    if (error) {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    } else {
      toast({ title: t("pharmacy.medicationRemoved") });
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    }
    setDeleting(false);
    setDeleteId(null);
  };

  const handleUpdateStock = async (id: string, newStock: number) => {
    if (isDemo) return;
    const status = newStock === 0 ? "out_of_stock" : newStock < 50 ? "low_stock" : "in_stock";
    const { error } = await supabase.from("medications").update({ stock: newStock, status }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["medications"] });
    }
  };

  const columns: Column<typeof meds[0]>[] = [
    { key: "name", header: t("pharmacy.medication"), searchable: true, render: (m) => <span className="font-medium">{m.name}</span> },
    { key: "category", header: t("common.category"), searchable: true },
    { 
      key: "stock", 
      header: t("common.stock"), 
      render: (m) => (
        <div className="flex items-center gap-2">
          <span>{m.stock} {m.unit}</span>
          <div className="flex gap-1">
            <button 
              onClick={() => handleUpdateStock(m.id, m.stock + 10)} 
              className="h-5 w-5 rounded bg-muted hover:bg-muted-foreground/20 text-xs font-medium"
            >+</button>
            <button 
              onClick={() => handleUpdateStock(m.id, Math.max(0, m.stock - 10))} 
              className="h-5 w-5 rounded bg-muted hover:bg-muted-foreground/20 text-xs font-medium"
            >−</button>
          </div>
        </div>
      )
    },
    { key: "price", header: t("common.price"), render: (m) => `$${m.price.toFixed(2)}` },
    { key: "status", header: t("common.status"), render: (m) => <StatusBadge variant={statusVariant[m.status] ?? "default"}>{m.status.replace(/_/g, " ")}</StatusBadge> },
    {
      key: "actions",
      header: t("common.actions"),
      render: (m) => (
        <button onClick={() => setDeleteId(m.id)} className="p-1.5 rounded-md hover:bg-muted text-destructive">
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("pharmacy.title")}</h1>
        <Button onClick={() => setShowAddModal(true)}><Plus className="h-4 w-4" /> {t("pharmacy.addMedication")}</Button>
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

      <AddMedicationModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["medications"] })}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="Remove Medication"
        message="Are you sure you want to remove this medication from inventory?"
        confirmLabel="Remove"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
