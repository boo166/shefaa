import { useEffect, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/primitives/Button";
import { PageContainer, SectionHeader } from "@/components/layout/AppLayout";
import { FlaskConical, Clock, CheckCircle, Plus } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { NewLabOrderModal } from "./NewLabOrderModal";
import { CompleteLabResultDialog } from "./CompleteLabResultDialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/shared/utils/formatDate";
import { labService } from "@/services/laboratory/lab.service";
import { queryKeys } from "@/services/queryKeys";
import type { LabOrderWithPatientDoctor } from "@/domain/lab/lab.types";

const statusVariant: Record<string, "default" | "warning" | "success"> = { pending: "default", processing: "warning", completed: "success" };

type LabOrderRow = LabOrderWithPatientDoctor;

type LabDisplayRow = {
  id: string;
  patient_name: string;
  test_name: string;
  doctor_name: string;
  order_date: string;
  status: "pending" | "processing" | "completed";
  result: string | null;
  abnormal_flag: string | null;
  result_notes: string | null;
};

export const LaboratoryPage = () => {
  const { t, locale, calendarType } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [resultDialogOrder, setResultDialogOrder] = useState<LabOrderRow | null>(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "order_date",
    direction: "desc",
  });
  const pageSize = 25;

  useRealtimeSubscription(["lab_orders"]);

  const { data: listPage, isLoading } = useQuery({
    queryKey: queryKeys.laboratory.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
      sort: { column: sort.column, ascending: sort.direction === "asc" },
    }),
    queryFn: async () => labService.listPagedWithRelations({
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

  const { data: statusCounts = { pending: 0, processing: 0, completed: 0 } } = useQuery({
    queryKey: queryKeys.laboratory.summary(user?.tenantId),
    enabled: !!user?.tenantId,
    queryFn: async () => labService.countByStatus(),
  });

  const liveLabs: LabOrderRow[] = listPage?.data ?? [];
  const totalLabs = listPage?.count ?? 0;

  const displayData: LabDisplayRow[] = liveLabs.map((l) => ({
    id: l.id,
    patient_name: l.patients?.full_name ?? "-",
    test_name: l.test_name,
    doctor_name: l.doctors?.full_name ?? "-",
    order_date: l.order_date,
    status: l.status,
    result: l.result ?? null,
    abnormal_flag: l.abnormal_flag ?? null,
    result_notes: l.result_notes ?? null,
  }));

  const total = totalLabs;

  const invalidateLabs = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.laboratory.root(user?.tenantId) });
  };

  const handleUpdateStatus = async (id: string, newStatus: string, result?: string) => {
    const update: any = { status: newStatus };
    if (result !== undefined) update.result = result;
    try {
      await labService.update(id, update);
      toast({ title: t("laboratory.statusUpdated") });
      invalidateLabs();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  const getLabStatusLabel = (status: string) => {
    if (status === "pending") return t("billing.pending");
    if (status === "processing") return t("laboratory.processing");
    if (status === "completed") return t("appointments.completed");
    return status;
  };

  const columns: Column<LabDisplayRow>[] = [
    { key: "patient_name", header: t("appointments.patient"), searchable: true },
    { key: "test_name", header: t("laboratory.test"), searchable: true, render: (l) => <span className="font-medium">{l.test_name}</span> },
    { key: "doctor_name", header: t("laboratory.orderedBy"), searchable: true },
    { key: "order_date", header: t("common.date"), sortable: true, render: (l) => formatDate(l.order_date, locale, "date", calendarType) },
    { key: "status", header: t("common.status"), sortable: true, render: (l) => <StatusBadge variant={statusVariant[l.status] ?? "default"}>{getLabStatusLabel(l.status)}</StatusBadge> },
    {
      key: "result",
      header: t("common.result"),
      render: (l) => l.result ? (
        <div className="space-y-1">
          <span className="font-medium">{l.result}</span>
          {l.result_notes ? (
            <div className="max-w-xs text-xs text-muted-foreground">{l.result_notes}</div>
          ) : null}
        </div>
      ) : <span className="text-muted-foreground">-</span>,
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (l) => (
        <div className="flex gap-1">
          {l.status === "pending" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleUpdateStatus(l.id, "processing")}
              className="h-7 px-2 text-xs bg-warning/10 text-warning hover:bg-warning/20"
            >
              {t("common.start")}
            </Button>
          )}
          {l.status === "processing" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const selectedOrder = liveLabs.find((order) => order.id === l.id) ?? null;
                setResultDialogOrder(selectedOrder);
              }}
              className="h-7 px-2 text-xs bg-success/10 text-success hover:bg-success/20"
            >
              Enter result
            </Button>
          )}
          {l.status === "completed" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const selectedOrder = liveLabs.find((order) => order.id === l.id) ?? null;
                setResultDialogOrder(selectedOrder);
              }}
              className="h-7 px-2 text-xs"
            >
              {t("laboratory.amend.action")}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-6">
      <SectionHeader
        title={t("laboratory.title")}
        actions={(
          <Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4" /> {t("laboratory.newLabOrder")}</Button>
        )}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t("laboratory.pendingOrders")} value={String(statusCounts.pending ?? 0)} icon={Clock} />
        <StatCard title={t("laboratory.processing")} value={String(statusCounts.processing ?? 0)} icon={FlaskConical} />
        <StatCard title={t("laboratory.completedToday")} value={String(statusCounts.completed ?? 0)} icon={CheckCircle} />
      </div>

      <DataTable
        columns={columns}
        data={displayData}
        keyExtractor={(l) => l.id}
        searchable
        serverSearch
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        sortColumn={sort.column}
        sortDirection={sort.direction}
        onSortChange={(column, direction) => {
          setSort({ column, direction });
          setPage(1);
        }}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        filterSlot={
          <StatusFilter
            options={[
              { value: "pending", label: t("billing.pending") },
              { value: "processing", label: t("laboratory.processing") },
              { value: "completed", label: t("appointments.completed") },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      <NewLabOrderModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          invalidateLabs();
        }}
      />
      <CompleteLabResultDialog
        open={!!resultDialogOrder}
        labOrder={resultDialogOrder}
        onClose={() => setResultDialogOrder(null)}
        onSuccess={() => {
          invalidateLabs();
        }}
      />
    </PageContainer>
  );
};
