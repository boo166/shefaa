import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";
import { Pill, Package, AlertTriangle, Plus } from "lucide-react";

interface Medication {
  id: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  price: number;
  status: "in_stock" | "low_stock" | "out_of_stock";
}

const DEMO_MEDS: Medication[] = [
  { id: "MED-001", name: "Lisinopril 10mg", category: "Antihypertensive", stock: 450, unit: "tablets", price: 12.50, status: "in_stock" },
  { id: "MED-002", name: "Metformin 500mg", category: "Antidiabetic", stock: 380, unit: "tablets", price: 8.00, status: "in_stock" },
  { id: "MED-003", name: "Amoxicillin 500mg", category: "Antibiotic", stock: 25, unit: "capsules", price: 15.00, status: "low_stock" },
  { id: "MED-004", name: "Omeprazole 20mg", category: "Proton Pump Inhibitor", stock: 200, unit: "capsules", price: 10.00, status: "in_stock" },
  { id: "MED-005", name: "Atorvastatin 20mg", category: "Statin", stock: 0, unit: "tablets", price: 18.00, status: "out_of_stock" },
  { id: "MED-006", name: "Ibuprofen 400mg", category: "NSAID", stock: 520, unit: "tablets", price: 6.50, status: "in_stock" },
];

const statusVariant = { in_stock: "success", low_stock: "warning", out_of_stock: "destructive" } as const;
const statusLabel = { in_stock: "In Stock", low_stock: "Low Stock", out_of_stock: "Out of Stock" } as const;

export const PharmacyPage = () => {
  const { t } = useI18n();

  const columns: Column<Medication>[] = [
    { key: "id", header: "ID" },
    { key: "name", header: "Medication", render: (m) => <span className="font-medium">{m.name}</span> },
    { key: "category", header: "Category" },
    { key: "stock", header: "Stock", render: (m) => `${m.stock} ${m.unit}` },
    { key: "price", header: "Price", render: (m) => `$${m.price.toFixed(2)}` },
    { key: "status", header: t("common.status"), render: (m) => <StatusBadge variant={statusVariant[m.status]}>{statusLabel[m.status]}</StatusBadge> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("common.pharmacy")}</h1>
        <Button><Plus className="h-4 w-4" /> Add Medication</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Medications" value="124" icon={Pill} />
        <StatCard title="Low Stock Items" value="8" icon={AlertTriangle} />
        <StatCard title="Inventory Value" value="$34,580" icon={Package} />
      </div>

      <DataTable columns={columns} data={DEMO_MEDS} keyExtractor={(m) => m.id} />
    </div>
  );
};
