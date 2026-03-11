import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { StatCard } from "@/shared/components/StatCard";
import { Button } from "@/components/ui/button";
import { FlaskConical, Clock, CheckCircle, Plus } from "lucide-react";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { NewLabOrderModal } from "./NewLabOrderModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatDate } from "@/shared/utils/formatDate";
import { labService } from "@/services/laboratory/lab.service";
import { patientService } from "@/services/patients/patient.service";
import { doctorService } from "@/services/doctors/doctor.service";
import { queryKeys } from "@/services/queryKeys";
import type { LabOrderWithPatientDoctor } from "@/domain/lab/lab.types";
import type { Patient } from "@/domain/patient/patient.types";
import type { Doctor } from "@/domain/doctor/doctor.types";

const DEMO_LABS = [
  { id: "1", patient_name: "Mohammed Al-Rashid", test_name: "Complete Blood Count (CBC)", doctor_name: "Dr. Sarah Ahmed", order_date: "2026-03-08", status: "completed", result: "Normal" },
  { id: "2", patient_name: "Fatima Hassan", test_name: "HbA1c", doctor_name: "Dr. Sarah Ahmed", order_date: "2026-03-08", status: "processing", result: null },
  { id: "3", patient_name: "Ali Mansour", test_name: "Lipid Panel", doctor_name: "Dr. John Smith", order_date: "2026-03-07", status: "completed", result: "Elevated LDL" },
  { id: "4", patient_name: "Noor Ibrahim", test_name: "Thyroid Panel", doctor_name: "Dr. Layla Khalid", order_date: "2026-03-07", status: "pending", result: null },
];

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
};

export const LaboratoryPage = () => {
  const { t, locale, calendarType } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 25;

  useRealtimeSubscription(["lab_orders"]);

  const { data: listPage, isLoading } = useQuery({
    queryKey: queryKeys.laboratory.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
    }),
    queryFn: async () => labService.listPagedWithRelations({
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
      sort: { column: "order_date", ascending: false },
    }),
    enabled: !isDemo && !!user?.tenantId,
  });

  const { data: patientPage } = useQuery({
    queryKey: queryKeys.patients.list({ tenantId: user?.tenantId, page: 1, pageSize: 500 }),
    queryFn: async () => patientService.listPaged({ page: 1, pageSize: 500, sort: { column: "full_name", ascending: true } }),
    enabled: !!user?.tenantId && !isDemo,
  });

  const { data: doctorPage } = useQuery({
    queryKey: queryKeys.doctors.list({ tenantId: user?.tenantId, page: 1, pageSize: 500 }),
    queryFn: async () => doctorService.listPaged({ page: 1, pageSize: 500, sort: { column: "full_name", ascending: true } }),
    enabled: !!user?.tenantId && !isDemo,
  });

  const patients: Patient[] = patientPage?.data ?? [];
  const doctors: Doctor[] = doctorPage?.data ?? [];

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const { data: statusCounts = { pending: 0, processing: 0, completed: 0 } } = useQuery({
    queryKey: queryKeys.laboratory.summary(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: async () => labService.countByStatus(),
  });

  const demoStatusCounts = DEMO_LABS.reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const effectiveStatusCounts = isDemo ? demoStatusCounts : statusCounts;

  const liveLabs: LabOrderRow[] = listPage?.data ?? [];
  const totalLabs = listPage?.count ?? 0;

  const displayData: LabDisplayRow[] = isDemo
    ? DEMO_LABS
    : liveLabs.map((l) => ({
        id: l.id,
        patient_name: l.patients?.full_name ?? "-",
        test_name: l.test_name,
        doctor_name: l.doctors?.full_name ?? "-",
        order_date: l.order_date,
        status: l.status,
        result: l.result ?? null,
      }));

  const demoFiltered = useMemo(() => {
    if (!isDemo) return displayData;
    const q = searchTerm.trim().toLowerCase();
    return displayData.filter((l) => {
      if (statusFilter && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.patient_name.toLowerCase().includes(q) ||
        l.doctor_name.toLowerCase().includes(q) ||
        l.test_name.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q) ||
        (l.result ?? "").toLowerCase().includes(q)
      );
    });
  }, [displayData, isDemo, searchTerm, statusFilter]);

  const pagedDemo = isDemo ? demoFiltered.slice((page - 1) * pageSize, page * pageSize) : displayData;
  const total = isDemo ? demoFiltered.length : totalLabs;

  const invalidateLabs = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.laboratory.root(user?.tenantId) });
  };

  const handleUpdateStatus = async (id: string, newStatus: string, result?: string) => {
    if (isDemo) return;
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
    { key: "order_date", header: t("common.date"), render: (l) => formatDate(l.order_date, locale, "date", calendarType) },
    { key: "status", header: t("common.status"), render: (l) => <StatusBadge variant={statusVariant[l.status] ?? "default"}>{getLabStatusLabel(l.status)}</StatusBadge> },
    { key: "result", header: t("common.result"), render: (l) => l.result ? <span className="font-medium">{l.result}</span> : <span className="text-muted-foreground">-</span> },
    {
      key: "actions",
      header: t("common.actions"),
      render: (l) => (
        <div className="flex gap-1">
          {l.status === "pending" && (
            <button
              onClick={() => handleUpdateStatus(l.id, "processing")}
              className="px-2 py-1 text-xs rounded bg-warning/10 text-warning hover:bg-warning/20"
            >
              {t("common.start")}
            </button>
          )}
          {l.status === "processing" && (
            <button
              onClick={() => handleUpdateStatus(l.id, "completed", "Normal")}
              className="px-2 py-1 text-xs rounded bg-success/10 text-success hover:bg-success/20"
            >
              {t("common.complete")}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("laboratory.title")}</h1>
        <Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4" /> {t("laboratory.newLabOrder")}</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t("laboratory.pendingOrders")} value={String(effectiveStatusCounts.pending ?? 0)} icon={Clock} />
        <StatCard title={t("laboratory.processing")} value={String(effectiveStatusCounts.processing ?? 0)} icon={FlaskConical} />
        <StatCard title={t("laboratory.completedToday")} value={String(effectiveStatusCounts.completed ?? 0)} icon={CheckCircle} />
      </div>

      <DataTable
        columns={columns}
        data={pagedDemo}
        keyExtractor={(l) => l.id}
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
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
        doctors={doctors.map((d) => ({ id: d.id, full_name: d.full_name }))}
      />
    </div>
  );
};
