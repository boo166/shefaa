import { useEffect, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/primitives/Button";
import { PageContainer, SectionHeader } from "@/components/layout/AppLayout";
import { Pill, Package, AlertTriangle, Plus, Trash2, Workflow } from "lucide-react";
import { MedicationWorkflowDialog } from "./MedicationWorkflowDialog";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { AddMedicationModal } from "./AddMedicationModal";
import { ProcurementPanel } from "./ProcurementPanel";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/shared/utils/formatDate";
import { pharmacyService } from "@/services/pharmacy/pharmacy.service";
import { queryKeys } from "@/services/queryKeys";
import type { Medication } from "@/domain/pharmacy/medication.types";

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
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [workflowMedication, setWorkflowMedication] = useState<Medication | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "created_at",
    direction: "desc",
  });
  const pageSize = 25;

  useRealtimeSubscription(["medications"]);

  const { data: listPage, isLoading } = useQuery({
    queryKey: queryKeys.pharmacy.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
      sort: { column: sort.column, ascending: sort.direction === "asc" },
    }),
    queryFn: async () => pharmacyService.listPaged({
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
      sort: { column: sort.column, ascending: sort.direction === "asc" },
    }),
    enabled: !!user?.tenantId,
  });

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const { data: medicationSummary = { total_count: 0, low_stock_count: 0, inventory_value: 0 } } = useQuery({
    queryKey: queryKeys.pharmacy.summary(user?.tenantId),
    enabled: !!user?.tenantId,
    queryFn: async () => pharmacyService.getSummary(),
  });

  const liveMeds = listPage?.data ?? [];
  const totalMeds = listPage?.count ?? 0;

  const meds: MedicationRow[] = liveMeds.map((m) => ({
    id: m.id,
    name: m.name,
    category: m.category ?? "",
    stock: m.stock,
    unit: m.unit,
    price: Number(m.price),
    status: m.status,
  }));

  const total = totalMeds;
  const totalCount = medicationSummary.total_count;
  const lowStockCount = medicationSummary.low_stock_count;
  const inventoryValue = medicationSummary.inventory_value;

  const invalidateMedications = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pharmacy.root(user?.tenantId) });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
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

  const getMedStatusLabel = (status: string) => {
    if (status === "in_stock") return t("pharmacy.inStock");
    if (status === "low_stock") return t("pharmacy.lowStock");
    if (status === "out_of_stock") return t("pharmacy.outOfStock");
    return status;
  };

  const columns: Column<MedicationRow>[] = [
    { key: "name", header: t("pharmacy.medication"), searchable: true, sortable: true, render: (m) => <span className="font-medium">{m.name}</span> },
    { key: "category", header: t("common.category"), searchable: true },
    {
      key: "stock",
      header: t("common.stock"),
      sortable: true,
      render: (m) => (
        <div className="flex items-center gap-2">
          <span>{m.stock} {m.unit}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWorkflowMedication(liveMeds.find((med) => med.id === m.id) ?? null)}
          >
            <Workflow className="h-4 w-4 me-1" />
            {t("pharmacy.workflow.title")}
          </Button>
        </div>
      ),
    },
    { key: "price", header: t("common.price"), sortable: true, render: (m) => formatCurrency(m.price, locale) },
    { key: "status", header: t("common.status"), sortable: true, render: (m) => <StatusBadge variant={statusVariant[m.status] ?? "default"}>{getMedStatusLabel(m.status)}</StatusBadge> },
    {
      key: "actions",
      header: t("common.actions"),
      render: (m) => (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setDeleteId(m.id)}
          className="text-destructive hover:text-destructive"
          aria-label={t("common.remove")}
          title={t("common.remove")}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-6">
      <SectionHeader
        title={t("pharmacy.title")}
        actions={(
          <Button onClick={() => setShowAddModal(true)}><Plus className="h-4 w-4" /> {t("pharmacy.addMedication")}</Button>
        )}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t("pharmacy.totalMedications")} value={String(totalCount)} icon={Pill} />
        <StatCard title={t("pharmacy.lowStockItems")} value={String(lowStockCount)} icon={AlertTriangle} />
        <StatCard title={t("pharmacy.inventoryValue")} value={formatCurrency(inventoryValue, locale)} icon={Package} />
      </div>

      <DataTable
        columns={columns}
        data={meds}
        keyExtractor={(m) => m.id}
        searchable
        serverSearch
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        isLoading={isLoading}
        sortColumn={sort.column}
        sortDirection={sort.direction}
        onSortChange={(column, direction) => {
          setSort({ column, direction });
          setPage(1);
        }}
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

      <ProcurementPanel medications={liveMeds} />

      <AddMedicationModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          invalidateMedications();
        }}
      />

      <MedicationWorkflowDialog
        medication={workflowMedication}
        open={!!workflowMedication}
        onClose={() => setWorkflowMedication(null)}
        onSuccess={invalidateMedications}
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
    </PageContainer>
  );
};
