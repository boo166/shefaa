import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";
import { Pill, Package, AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { AddMedicationModal } from "./AddMedicationModal";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/shared/utils/formatDate";
import { pharmacyService } from "@/services/pharmacy/pharmacy.service";
import { queryKeys } from "@/services/queryKeys";
import type { Medication } from "@/domain/pharmacy/medication.types";

const DEMO_MEDS = [
  { id: "1", name: "Lisinopril 10mg", category: "Antihypertensive", stock: 450, unit: "tablets", price: 12.5, status: "in_stock" },
  { id: "2", name: "Metformin 500mg", category: "Antidiabetic", stock: 380, unit: "tablets", price: 8.0, status: "in_stock" },
  { id: "3", name: "Amoxicillin 500mg", category: "Antibiotic", stock: 25, unit: "capsules", price: 15.0, status: "low_stock" },
  { id: "4", name: "Omeprazole 20mg", category: "Proton Pump Inhibitor", stock: 200, unit: "capsules", price: 10.0, status: "in_stock" },
  { id: "5", name: "Atorvastatin 20mg", category: "Statin", stock: 0, unit: "tablets", price: 18.0, status: "out_of_stock" },
];

const statusVariant: Record<string, "success" | "warning" | "destructive"> = {
  in_stock: "success",
  low_stock: "warning",
  out_of_stock: "destructive",
};

type MedicationRow = Pick<Medication, "id" | "name" | "category" | "stock" | "unit" | "price" | "status">;

export const PharmacyPage = () => {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 25;

  useRealtimeSubscription(["medications"]);

  const { data: listPage, isLoading } = useQuery({
    queryKey: queryKeys.pharmacy.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
    }),
    queryFn: async () => pharmacyService.listPaged({
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
      sort: { column: "created_at", ascending: false },
    }),
    enabled: !isDemo && !!user?.tenantId,
  });

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const { data: medicationSummary = { total_count: 0, low_stock_count: 0, inventory_value: 0 } } = useQuery({
    queryKey: queryKeys.pharmacy.summary(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: async () => pharmacyService.getSummary(),
  });

  const liveMeds = listPage?.data ?? [];
  const totalMeds = listPage?.count ?? 0;

  const meds: MedicationRow[] = isDemo
    ? DEMO_MEDS
    : liveMeds.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category ?? "",
        stock: m.stock,
        unit: m.unit,
        price: Number(m.price),
        status: m.status as MedicationRow["status"],
        status: m.status,
      }));

  const demoFiltered = useMemo(() => {
    if (!isDemo) return meds;
    const q = searchTerm.trim().toLowerCase();
    return meds.filter((m) => {
      if (statusFilter && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.category ?? "").toLowerCase().includes(q) ||
        m.status.toLowerCase().includes(q)
      );
    });
  }, [isDemo, meds, searchTerm, statusFilter]);

  const pagedDemo = isDemo ? demoFiltered.slice((page - 1) * pageSize, page * pageSize) : meds;
  const total = isDemo ? demoFiltered.length : totalMeds;

  const demoTotalCount = DEMO_MEDS.length;
  const demoLowStock = DEMO_MEDS.filter((m) => m.status === "low_stock").length;
  const demoInventoryValue = DEMO_MEDS.reduce((s, m) => s + m.price * m.stock, 0);

  const totalCount = isDemo ? demoTotalCount : medicationSummary.total_count;
  const lowStockCount = isDemo ? demoLowStock : medicationSummary.low_stock_count;
  const inventoryValue = isDemo ? demoInventoryValue : medicationSummary.inventory_value;

  const invalidateMedications = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pharmacy.root(user?.tenantId) });
  };

  const handleDelete = async () => {
    if (!deleteId || isDemo) return;
    setDeleting(true);
    try {
      await pharmacyService.remove(deleteId);
      toast({ title: t("pharmacy.medicationRemoved") });
      invalidateMedications();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const handleUpdateStock = async (id: string, newStock: number) => {
    if (isDemo) return;
    const status = newStock === 0 ? "out_of_stock" : newStock < 50 ? "low_stock" : "in_stock";
    try {
      await pharmacyService.update(id, { stock: newStock, status });
      invalidateMedications();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  const getMedStatusLabel = (status: string) => {
    if (status === "in_stock") return t("pharmacy.inStock");
    if (status === "low_stock") return t("pharmacy.lowStock");
    if (status === "out_of_stock") return t("pharmacy.outOfStock");
    return status;
  };

  const columns: Column<MedicationRow>[] = [
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
            >-</button>
          </div>
        </div>
      ),
    },
    { key: "price", header: t("common.price"), render: (m) => formatCurrency(m.price, locale) },
    { key: "status", header: t("common.status"), render: (m) => <StatusBadge variant={statusVariant[m.status] ?? "default"}>{getMedStatusLabel(m.status)}</StatusBadge> },
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
        <StatCard title={t("pharmacy.totalMedications")} value={String(totalCount)} icon={Pill} />
        <StatCard title={t("pharmacy.lowStockItems")} value={String(lowStockCount)} icon={AlertTriangle} />
        <StatCard title={t("pharmacy.inventoryValue")} value={formatCurrency(inventoryValue, locale)} icon={Package} />
      </div>

      <DataTable
        columns={columns}
        data={pagedDemo}
        keyExtractor={(m) => m.id}
        searchable
        serverSearch
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        isLoading={!isDemo && isLoading}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        filterSlot={
          <StatusFilter
            options={[
              { value: "in_stock", label: t("pharmacy.inStock") },
              { value: "low_stock", label: t("pharmacy.lowStock") },
              { value: "out_of_stock", label: t("pharmacy.outOfStock") },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      <AddMedicationModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          invalidateMedications();
        }}
      />

      <ConfirmDialog
        open={!!deleteId}
        title={t("pharmacy.removeMedicationTitle")}
        message={t("pharmacy.removeMedicationMessage")}
        confirmLabel={t("common.remove")}
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
};
