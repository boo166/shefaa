import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { DataTable, Column } from "@/shared/components/DataTable";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { DollarSign, CreditCard, FileText, TrendingUp, Plus, CheckCircle } from "lucide-react";
import { NewInvoiceModal } from "./NewInvoiceModal";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "@/core/auth/authStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from "@/shared/utils/formatDate";
import { billingService } from "@/services/billing/billing.service";
import { patientService } from "@/services/patients/patient.service";
import { queryKeys } from "@/services/queryKeys";
import type { InvoiceWithPatient } from "@/domain/billing/billing.types";
import type { Patient } from "@/domain/patient/patient.types";

const DEMO_INVOICES = [
  { id: "1", invoice_code: "INV-001", patient_name: "Mohammed Al-Rashid", service: "Cardiology Consultation", amount: 350, invoice_date: "2026-03-08", status: "paid" },
  { id: "2", invoice_code: "INV-002", patient_name: "Fatima Hassan", service: "Follow-up Visit", amount: 150, invoice_date: "2026-03-07", status: "paid" },
  { id: "3", invoice_code: "INV-003", patient_name: "Ali Mansour", service: "Lab Work - Complete Panel", amount: 520, invoice_date: "2026-03-06", status: "pending" },
  { id: "4", invoice_code: "INV-004", patient_name: "Noor Ibrahim", service: "Pediatric Check-up", amount: 200, invoice_date: "2026-03-05", status: "overdue" },
];

const statusVariant = { paid: "success", pending: "warning", overdue: "destructive" } as const;

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type InvoiceRow = InvoiceWithPatient;

type InvoiceDisplayRow = {
  id: string;
  invoice_code: string;
  patient_name: string;
  service: string;
  amount: number;
  invoice_date: string;
  status: "paid" | "pending" | "overdue";
};

export const BillingPage = () => {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 25;

  useRealtimeSubscription(["invoices"]);

  const { data: listPage, isLoading } = useQuery({
    queryKey: queryKeys.billing.list({
      tenantId: user?.tenantId,
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
    }),
    queryFn: async () => billingService.listPagedWithRelations({
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
      sort: { column: "created_at", ascending: false },
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

  const now = new Date();
  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthStart = toDateKey(monthStartDate);
  const monthEnd = toDateKey(monthEndDate);
  const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;

  const { data: invoiceSummary = { total_count: 0, paid_count: 0, paid_amount: 0, pending_amount: 0 } } = useQuery({
    queryKey: queryKeys.billing.summary(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: async () => billingService.getSummary(),
  });

  const { data: invoicesThisMonth = 0 } = useQuery({
    queryKey: queryKeys.billing.monthCount(user?.tenantId, monthKey),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: async () => billingService.countInRange(monthStart, monthEnd),
  });

  const liveInvoices: InvoiceRow[] = listPage?.data ?? [];
  const totalInvoices = listPage?.count ?? 0;

  const invoices: InvoiceDisplayRow[] = isDemo
    ? (DEMO_INVOICES as InvoiceDisplayRow[])
    : liveInvoices.map((inv) => ({
        id: inv.id,
        invoice_code: inv.invoice_code,
        patient_name: inv.patients?.full_name ?? "-",
        service: inv.service,
        amount: Number(inv.amount),
        invoice_date: inv.invoice_date,
        status: inv.status as InvoiceDisplayRow["status"],
      }));

  const demoFiltered = useMemo(() => {
    if (!isDemo) return invoices;
    const q = searchTerm.trim().toLowerCase();
    return invoices.filter((i) => {
      if (statusFilter && i.status !== statusFilter) return false;
      if (!q) return true;
      return (
        i.invoice_code.toLowerCase().includes(q) ||
        i.patient_name.toLowerCase().includes(q) ||
        i.service.toLowerCase().includes(q) ||
        i.status.toLowerCase().includes(q)
      );
    });
  }, [invoices, isDemo, searchTerm, statusFilter]);

  const pagedDemo = isDemo ? demoFiltered.slice((page - 1) * pageSize, page * pageSize) : invoices;
  const total = isDemo ? demoFiltered.length : totalInvoices;

  const demoPaidAmount = DEMO_INVOICES.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const demoPendingAmount = DEMO_INVOICES.filter((i) => i.status === "pending" || i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const demoPaidCount = DEMO_INVOICES.filter((i) => i.status === "paid").length;
  const demoMonthCount = DEMO_INVOICES.filter((i) => {
    const d = new Date(i.invoice_date);
    return d >= monthStartDate && d < monthEndDate;
  }).length;

  const totalRevenue = isDemo ? demoPaidAmount : invoiceSummary.paid_amount;
  const pendingAmount = isDemo ? demoPendingAmount : invoiceSummary.pending_amount;
  const totalCount = isDemo ? DEMO_INVOICES.length : invoiceSummary.total_count;
  const paidCount = isDemo ? demoPaidCount : invoiceSummary.paid_count;
  const collectionRate = totalCount ? Math.round((paidCount / totalCount) * 100) : 0;
  const invoicesThisMonthValue = isDemo ? demoMonthCount : invoicesThisMonth;

  const invalidateInvoices = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.billing.root(user?.tenantId) });
  };

  const handleMarkPaid = async (id: string) => {
    if (isDemo) return;
    try {
      await billingService.update(id, { status: "paid" });
      toast({ title: t("billing.invoiceMarkedPaid") });
      invalidateInvoices();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === "paid") return t("billing.paid");
    if (status === "pending") return t("billing.pending");
    if (status === "overdue") return t("billing.overdue");
    return status;
  };

  const columns: Column<InvoiceDisplayRow>[] = [
    { key: "invoice_code", header: t("billing.invoiceNumber"), searchable: true, render: (inv) => <span className="font-medium">{inv.invoice_code}</span> },
    { key: "patient_name", header: t("appointments.patient"), searchable: true },
    { key: "service", header: t("common.service"), searchable: true },
    { key: "amount", header: t("common.amount"), render: (inv) => <span className="font-semibold">{formatCurrency(inv.amount, locale)}</span> },
    { key: "invoice_date", header: t("common.date"), render: (inv) => formatDate(inv.invoice_date, locale) },
    { key: "status", header: t("common.status"), render: (inv) => <StatusBadge variant={(statusVariant as any)[inv.status] ?? "default"}>{getStatusLabel(inv.status)}</StatusBadge> },
    {
      key: "actions",
      header: t("common.actions"),
      render: (inv) => inv.status !== "paid" ? (
        <button
          onClick={() => handleMarkPaid(inv.id)}
          className="p-1.5 rounded-md hover:bg-success/10 text-success"
          title={t("billing.markAsPaid")}
        >
          <CheckCircle className="h-4 w-4" />
        </button>
      ) : null,
    },
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
        <StatCard title={t("billing.totalRevenue")} value={formatCurrency(totalRevenue, locale)} icon={DollarSign} />
        <StatCard title={t("billing.pendingPayments")} value={formatCurrency(pendingAmount, locale)} icon={CreditCard} />
        <StatCard title={t("billing.invoicesThisMonth")} value={String(invoicesThisMonthValue)} icon={FileText} />
        <StatCard title={t("billing.collectionRate")} value={totalCount ? `${collectionRate}%` : "-"} icon={TrendingUp} />
      </div>

      <DataTable
        columns={columns}
        data={pagedDemo}
        keyExtractor={(inv) => inv.id}
        searchable
        serverSearch
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        isLoading={!isDemo && isLoading}
        exportFileName="invoices"
        pdfExport={{
          title: t("billing.title"),
          subtitle: `${t("billing.totalRevenue")}: ${formatCurrency(totalRevenue, locale)} | ${t("billing.collectionRate")}: ${totalCount ? collectionRate : 0}%`,
        }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        filterSlot={
          <StatusFilter
            options={[
              { value: "paid", label: t("billing.paid") },
              { value: "pending", label: t("billing.pending") },
              { value: "overdue", label: t("billing.overdue") },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        }
      />

      <NewInvoiceModal
        open={showModal} onClose={() => setShowModal(false)}
        onSuccess={() => {
          invalidateInvoices();
        }}
        patients={patients.map((p) => ({ id: p.id, full_name: p.full_name }))}
      />
    </div>
  );
};
