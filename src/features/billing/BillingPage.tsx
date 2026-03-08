import { useState, useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { DataTable, Column } from "@/shared/components/DataTable";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { DollarSign, CreditCard, FileText, TrendingUp, Plus } from "lucide-react";
import { NewInvoiceModal } from "./NewInvoiceModal";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { Tables } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices"> & { patients?: { full_name: string } | null };

const DEMO_INVOICES = [
  { id: "1", invoice_code: "INV-001", patient_name: "Mohammed Al-Rashid", service: "Cardiology Consultation", amount: 350, invoice_date: "2026-03-08", status: "paid" },
  { id: "2", invoice_code: "INV-002", patient_name: "Fatima Hassan", service: "Follow-up Visit", amount: 150, invoice_date: "2026-03-07", status: "paid" },
  { id: "3", invoice_code: "INV-003", patient_name: "Ali Mansour", service: "Lab Work - Complete Panel", amount: 520, invoice_date: "2026-03-06", status: "pending" },
  { id: "4", invoice_code: "INV-004", patient_name: "Noor Ibrahim", service: "Pediatric Check-up", amount: 200, invoice_date: "2026-03-05", status: "overdue" },
];

const statusVariant = { paid: "success", pending: "warning", overdue: "destructive" } as const;

export const BillingPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useRealtimeSubscription(["invoices"]);

  const { data: liveInvoices = [], isLoading } = useSupabaseTable<Invoice>("invoices", {
    select: "*, patients(full_name)",
    orderBy: { column: "created_at", ascending: false },
  });
  const { data: patients = [] } = useSupabaseTable<Tables<"patients">>("patients");

  const displayData = isDemo
    ? DEMO_INVOICES
    : liveInvoices.map((inv) => ({
        id: inv.id, invoice_code: inv.invoice_code, patient_name: inv.patients?.full_name ?? "—",
        service: inv.service, amount: Number(inv.amount), invoice_date: inv.invoice_date, status: inv.status,
      }));

  const filtered = useMemo(() => statusFilter ? displayData.filter((i) => i.status === statusFilter) : displayData, [displayData, statusFilter]);
  const totalRevenue = displayData.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const pendingAmount = displayData.filter((i) => i.status === "pending" || i.status === "overdue").reduce((s, i) => s + i.amount, 0);

  const columns: Column<typeof displayData[0]>[] = [
    { key: "invoice_code", header: t("billing.invoiceNumber"), searchable: true, render: (inv) => <span className="font-medium">{inv.invoice_code}</span> },
    { key: "patient_name", header: t("appointments.patient"), searchable: true },
    { key: "service", header: t("common.service"), searchable: true },
    { key: "amount", header: t("common.amount"), render: (inv) => <span className="font-semibold">${inv.amount}</span> },
    { key: "invoice_date", header: t("common.date") },
    { key: "status", header: t("common.status"), render: (inv) => <StatusBadge variant={(statusVariant as any)[inv.status] ?? "default"}>{inv.status}</StatusBadge> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("billing.title")}</h1>
        <PermissionGuard permission="manage_billing">
          <Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4" /> {t("billing.newInvoice")}</Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t("billing.totalRevenue")} value={`$${totalRevenue.toLocaleString()}`} icon={DollarSign} />
        <StatCard title={t("billing.pendingPayments")} value={`$${pendingAmount.toLocaleString()}`} icon={CreditCard} />
        <StatCard title={t("billing.invoicesThisMonth")} value={String(displayData.length)} icon={FileText} />
        <StatCard title={t("billing.collectionRate")} value={displayData.length ? `${Math.round((displayData.filter((i) => i.status === "paid").length / displayData.length) * 100)}%` : "—"} icon={TrendingUp} />
      </div>

      <DataTable
        columns={columns} data={filtered} keyExtractor={(inv) => inv.id} searchable isLoading={!isDemo && isLoading} exportFileName="invoices"
        filterSlot={
          <StatusFilter
            options={[{ value: "paid", label: "Paid" }, { value: "pending", label: "Pending" }, { value: "overdue", label: "Overdue" }]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      <NewInvoiceModal
        open={showModal} onClose={() => setShowModal(false)}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["invoices"] })}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
      />
    </div>
  );
};
