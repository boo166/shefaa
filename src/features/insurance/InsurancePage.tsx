import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { DataTable, Column } from "@/shared/components/DataTable";
import { Shield, Plus, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { NewClaimModal } from "./NewClaimModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from "@/shared/utils/formatDate";
import { insuranceService } from "@/services/insurance/insurance.service";
import { patientService } from "@/services/patients/patient.service";
import { queryKeys } from "@/services/queryKeys";
import type { InsuranceClaimWithPatient } from "@/domain/insurance/insurance.types";
import type { Patient } from "@/domain/patient/patient.types";

const DEMO_CLAIMS = [
  { id: "1", patient_name: "Mohammed Al-Rashid", provider: "National Health Co.", service: "Cardiology Consultation", amount: 350, claim_date: "2026-03-08", status: "approved" },
  { id: "2", patient_name: "Fatima Hassan", provider: "Gulf Insurance", service: "Follow-up Visit", amount: 150, claim_date: "2026-03-07", status: "pending" },
  { id: "3", patient_name: "Ali Mansour", provider: "MedCare Plus", service: "Lab Work", amount: 520, claim_date: "2026-03-06", status: "approved" },
  { id: "4", patient_name: "Noor Ibrahim", provider: "National Health Co.", service: "Pediatric Check-up", amount: 200, claim_date: "2026-03-05", status: "rejected" },
];

const statusVariant: Record<string, "success" | "warning" | "destructive"> = { approved: "success", pending: "warning", rejected: "destructive" };

type ClaimRow = InsuranceClaimWithPatient;

type ClaimDisplayRow = {
  id: string;
  patient_name: string;
  provider: string;
  service: string;
  amount: number;
  claim_date: string;
  status: "approved" | "pending" | "rejected";
};

export const InsurancePage = () => {
  const { t, locale, calendarType } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 25;

  useRealtimeSubscription(["insurance_claims"]);

  const { data: listPage, isLoading } = useQuery({
    queryKey: queryKeys.insurance.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
    }),
    queryFn: async () => insuranceService.listPagedWithRelations({
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
      sort: { column: "claim_date", ascending: false },
    }),
    enabled: !isDemo && !!user?.tenantId,
  });

  const { data: patientPage } = useQuery({
    queryKey: queryKeys.patients.list({ tenantId: user?.tenantId, page: 1, pageSize: 500 }),
    queryFn: async () => patientService.listPaged({ page: 1, pageSize: 500, sort: { column: "full_name", ascending: true } }),
    enabled: !!user?.tenantId && !isDemo,
  });

  const patients: Patient[] = patientPage?.data ?? [];

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const { data: insuranceSummary = { total_count: 0, pending_count: 0, approved_count: 0, rejected_count: 0, providers_count: 0 } } = useQuery({
    queryKey: queryKeys.insurance.summary(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: async () => insuranceService.getSummary(),
  });

  const liveClaims: ClaimRow[] = listPage?.data ?? [];
  const totalClaims = listPage?.count ?? 0;

  const claims: ClaimDisplayRow[] = isDemo
    ? DEMO_CLAIMS
    : liveClaims.map((c) => ({
        id: c.id,
        patient_name: (c as any).patients?.full_name ?? "-",
        provider: c.provider,
        service: c.service,
        amount: Number(c.amount),
        claim_date: c.claim_date,
        status: c.status,
      }));

  const demoFiltered = useMemo(() => {
    if (!isDemo) return claims;
    const q = searchTerm.trim().toLowerCase();
    return claims.filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.patient_name.toLowerCase().includes(q) ||
        c.provider.toLowerCase().includes(q) ||
        c.service.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
      );
    });
  }, [claims, isDemo, searchTerm, statusFilter]);

  const pagedDemo = isDemo ? demoFiltered.slice((page - 1) * pageSize, page * pageSize) : claims;
  const total = isDemo ? demoFiltered.length : totalClaims;

  const demoProviderCount = new Set(DEMO_CLAIMS.map((c) => c.provider)).size;
  const demoPending = DEMO_CLAIMS.filter((c) => c.status === "pending").length;
  const demoApproved = DEMO_CLAIMS.filter((c) => c.status === "approved").length;
  const demoTotal = DEMO_CLAIMS.length;

  const pending = isDemo ? demoPending : insuranceSummary.pending_count;
  const approved = isDemo ? demoApproved : insuranceSummary.approved_count;
  const providerCount = isDemo ? demoProviderCount : insuranceSummary.providers_count;
  const totalCount = isDemo ? demoTotal : insuranceSummary.total_count;
  const rate = totalCount ? Math.round((approved / totalCount) * 100) : 0;

  const invalidateClaims = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.insurance.root(user?.tenantId) });
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    if (isDemo) return;
    try {
      await insuranceService.update(id, { status: newStatus as ClaimDisplayRow["status"] });
      toast({ title: newStatus === "approved" ? t("insurance.approved") : t("insurance.rejected") });
      invalidateClaims();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  const getClaimStatusLabel = (status: string) => {
    if (status === "approved") return t("insurance.approved");
    if (status === "rejected") return t("insurance.rejected");
    if (status === "pending") return t("billing.pending");
    return status;
  };

  const columns: Column<ClaimDisplayRow>[] = [
    { key: "patient_name", header: t("appointments.patient"), searchable: true },
    { key: "provider", header: t("common.provider"), searchable: true },
    { key: "service", header: t("common.service"), searchable: true },
    { key: "amount", header: t("common.amount"), render: (c) => formatCurrency(c.amount, locale) },
    { key: "claim_date", header: t("common.date"), render: (c) => formatDate(c.claim_date, locale, "date", calendarType) },
    { key: "status", header: t("common.status"), render: (c) => <StatusBadge variant={statusVariant[c.status] ?? "default"}>{getClaimStatusLabel(c.status)}</StatusBadge> },
    {
      key: "actions",
      header: t("common.actions"),
      render: (c) => c.status === "pending" ? (
        <div className="flex gap-1">
          <button
            onClick={() => handleUpdateStatus(c.id, "approved")}
            className="p-1.5 rounded-md hover:bg-success/10 text-success"
            title={t("common.approve")}
          >
            <CheckCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleUpdateStatus(c.id, "rejected")}
            className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive"
            title={t("common.reject")}
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("insurance.title")}</h1>
        <Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4" /> {t("insurance.newClaim")}</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t("insurance.activeProviders")} value={String(providerCount)} icon={Shield} />
        <StatCard title={t("insurance.pendingClaims")} value={String(pending)} icon={Shield} />
        <StatCard title={t("insurance.approvalRate")} value={`${rate}%`} icon={Shield} />
      </div>

      <DataTable
        columns={columns}
        data={pagedDemo}
        keyExtractor={(c) => c.id}
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
              { value: "approved", label: t("insurance.approved") },
              { value: "pending", label: t("billing.pending") },
              { value: "rejected", label: t("insurance.rejected") },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      <NewClaimModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          invalidateClaims();
        }}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
      />
    </div>
  );
};
