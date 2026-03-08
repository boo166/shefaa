import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { DataTable, Column } from "@/shared/components/DataTable";
import { Shield, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { Tables } from "@/integrations/supabase/types";

type Claim = Tables<"insurance_claims"> & { patients?: { full_name: string } | null };

const DEMO_CLAIMS = [
  { id: "1", patient_name: "Mohammed Al-Rashid", provider: "National Health Co.", service: "Cardiology Consultation", amount: 350, claim_date: "2026-03-08", status: "approved" },
  { id: "2", patient_name: "Fatima Hassan", provider: "Gulf Insurance", service: "Follow-up Visit", amount: 150, claim_date: "2026-03-07", status: "pending" },
  { id: "3", patient_name: "Ali Mansour", provider: "MedCare Plus", service: "Lab Work", amount: 520, claim_date: "2026-03-06", status: "approved" },
  { id: "4", patient_name: "Noor Ibrahim", provider: "National Health Co.", service: "Pediatric Check-up", amount: 200, claim_date: "2026-03-05", status: "rejected" },
];

const statusVariant: Record<string, "success" | "warning" | "destructive"> = { approved: "success", pending: "warning", rejected: "destructive" };

export const InsurancePage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useRealtimeSubscription(["insurance_claims"]);

  const { data: liveClaims = [], isLoading } = useSupabaseTable<Claim>("insurance_claims", {
    select: "*, patients(full_name)",
    orderBy: { column: "claim_date", ascending: false },
  });

  const displayData = isDemo
    ? DEMO_CLAIMS
    : liveClaims.map((c) => ({
        id: c.id, patient_name: c.patients?.full_name ?? "—", provider: c.provider,
        service: c.service, amount: Number(c.amount), claim_date: c.claim_date, status: c.status,
      }));

  const filtered = useMemo(() => statusFilter ? displayData.filter((c) => c.status === statusFilter) : displayData, [displayData, statusFilter]);

  const pending = displayData.filter((c) => c.status === "pending").length;
  const approved = displayData.filter((c) => c.status === "approved").length;
  const rate = displayData.length ? Math.round((approved / displayData.length) * 100) : 0;

  const columns: Column<typeof displayData[0]>[] = [
    { key: "patient_name", header: t("appointments.patient"), searchable: true },
    { key: "provider", header: t("common.provider"), searchable: true },
    { key: "service", header: t("common.service"), searchable: true },
    { key: "amount", header: t("common.amount"), render: (c) => `$${c.amount}` },
    { key: "claim_date", header: t("common.date") },
    { key: "status", header: t("common.status"), render: (c) => <StatusBadge variant={statusVariant[c.status] ?? "default"}>{c.status}</StatusBadge> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("insurance.title")}</h1>
        <Button><Plus className="h-4 w-4" /> {t("insurance.newClaim")}</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title={t("insurance.activeProviders")} value={String(new Set(displayData.map((c) => c.provider)).size)} icon={Shield} />
        <StatCard title={t("insurance.pendingClaims")} value={String(pending)} icon={Shield} />
        <StatCard title={t("insurance.approvalRate")} value={`${rate}%`} icon={Shield} />
      </div>

      <DataTable
        columns={columns} data={filtered} keyExtractor={(c) => c.id} searchable isLoading={!isDemo && isLoading}
        filterSlot={
          <StatusFilter
            options={[{ value: "approved", label: "Approved" }, { value: "pending", label: "Pending" }, { value: "rejected", label: "Rejected" }]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />
    </div>
  );
};
