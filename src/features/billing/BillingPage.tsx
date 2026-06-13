import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { DataTable, Column } from "@/shared/components/DataTable";
import { Button } from "@/components/primitives/Button";
import { Input, Textarea } from "@/components/primitives/Inputs";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { PageContainer, SectionHeader } from "@/components/layout/AppLayout";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DollarSign, CreditCard, FileText, TrendingUp, Plus, Ban, Wallet, RotateCcw, FileX } from "lucide-react";
import { NewInvoiceModal } from "./NewInvoiceModal";
import { PostPaymentDialog } from "./PostPaymentDialog";
import { RefundDialog } from "./RefundDialog";
import { WriteOffDialog } from "./WriteOffDialog";
import { PaymentReversalDialog } from "./PaymentReversalDialog";
import { FinancialIntegrityPanel } from "./FinancialIntegrityPanel";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { selectEffectiveTenantId, useAuth } from "@/core/auth/authStore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from "@/shared/utils/formatDate";
import { billingService } from "@/services/billing/billing.service";
import { queryKeys } from "@/services/queryKeys";
import type { InvoiceWithPatient } from "@/domain/billing/billing.types";

const statusVariant = {
  paid: "success",
  pending: "warning",
  overdue: "destructive",
  partially_paid: "warning",
  void: "destructive",
} as const;

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const getStatusLabel = (status: string, t: (path: string, options?: Record<string, unknown>) => string) => {
  if (status === "paid") return t("billing.paid");
  if (status === "pending") return t("billing.pending");
  if (status === "overdue") return t("billing.overdue");
  if (status === "partially_paid") return t("billing.status.partiallyPaid");
  if (status === "void") return t("billing.status.void");
  return status;
};

export const BillingPage = () => {
  const { t, locale } = useI18n();
  const effectiveTenantId = useAuth(selectEffectiveTenantId);
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithPatient | null>(null);
  const [voidInvoice, setVoidInvoice] = useState<InvoiceWithPatient | null>(null);
  const [refundInvoice, setRefundInvoice] = useState<InvoiceWithPatient | null>(null);
  const [writeOffInvoice, setWriteOffInvoice] = useState<InvoiceWithPatient | null>(null);
  const [reversalInvoice, setReversalInvoice] = useState<InvoiceWithPatient | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "invoice_date",
    direction: "desc",
  });
  const pageSize = 25;

  useRealtimeSubscription(["invoices"]);

  const listArgs = useMemo(() => ({
    tenantId: effectiveTenantId ?? undefined,
    page,
    pageSize,
    search: searchTerm.trim() || undefined,
    filters: statusFilter ? { status: statusFilter } : undefined,
    sort: { column: sort.column, ascending: sort.direction === "asc" },
  }), [page, pageSize, searchTerm, sort.column, sort.direction, statusFilter, effectiveTenantId]);

  const listQuery = useQuery({
    queryKey: queryKeys.billing.list(listArgs),
    queryFn: async () => billingService.listPagedWithRelations({
      page,
      pageSize,
      search: searchTerm.trim() || undefined,
      filters: statusFilter ? { status: statusFilter } : undefined,
      sort: { column: sort.column, ascending: sort.direction === "asc" },
    }),
    enabled: !!effectiveTenantId,
  });

  const { data: listPage, isLoading } = listQuery;

  useEffect(() => {
    setPage(1);
  }, [statusFilter, searchTerm]);

  const now = new Date();
  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthStart = toDateKey(monthStartDate);
  const monthEnd = toDateKey(monthEndDate);
  const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;

  const summaryQuery = useQuery({
    queryKey: queryKeys.billing.summary(effectiveTenantId ?? undefined),
    enabled: !!effectiveTenantId,
    queryFn: async () => billingService.getSummary(),
  });

  const { data: invoiceSummary = { total_count: 0, paid_count: 0, paid_amount: 0, pending_amount: 0 } } = summaryQuery;

  const monthQuery = useQuery({
    queryKey: queryKeys.billing.monthCount(effectiveTenantId ?? undefined, monthKey),
    enabled: !!effectiveTenantId,
    queryFn: async () => billingService.countInRange(monthStart, monthEnd),
  });

  const { data: invoicesThisMonth = 0 } = monthQuery;

  const invoices = listPage?.data ?? [];
  const totalInvoices = listPage?.count ?? 0;

  const total = totalInvoices;
  const totalRevenue = Number(invoiceSummary.paid_amount ?? 0);
  const pendingAmount = Number(invoiceSummary.pending_amount ?? 0);
  const totalCollectedAndOutstanding = totalRevenue + pendingAmount;
  const collectionRate = totalCollectedAndOutstanding
    ? Math.round((totalRevenue / totalCollectedAndOutstanding) * 100)
    : 0;

  const billingError =
    listQuery.error ?? summaryQuery.error ?? monthQuery.error;
  const billingErrorMessage = billingError instanceof Error ? billingError.message : String(billingError ?? "");

  const invalidateInvoices = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.billing.root(effectiveTenantId ?? undefined) });
  };

  const handleVoidInvoice = async () => {
    if (!voidInvoice) return;
    if (!voidReason.trim()) {
      toast({
        title: t("common.missingFields"),
        description: t("billing.void.reasonRequired"),
        variant: "destructive",
      });
      return;
    }

    setVoiding(true);
    try {
      await billingService.voidInvoice(voidInvoice.id, voidReason.trim());
      toast({ title: t("billing.void.success") });
      setVoidInvoice(null);
      setVoidReason("");
      invalidateInvoices();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setVoiding(false);
    }
  };

  const columns: Column<InvoiceWithPatient>[] = [
    {
      key: "invoice_code",
      header: t("billing.invoiceNumber"),
      searchable: true,
      render: (invoice) => <span className="font-medium">{invoice.invoice_code}</span>,
    },
    {
      key: "patient_name",
      header: t("appointments.patient"),
      searchable: true,
      render: (invoice) => invoice.patients?.full_name ?? "-",
    },
    {
      key: "service",
      header: t("common.service"),
      searchable: true,
      render: (invoice) => invoice.service,
    },
    {
      key: "amount",
      header: t("common.amount"),
      render: (invoice) => <span className="font-semibold">{formatCurrency(Number(invoice.amount), locale)}</span>,
    },
    {
      key: "amount_paid",
      header: t("billing.paid"),
      render: (invoice) => <span className="text-success">{formatCurrency(Number(invoice.amount_paid), locale)}</span>,
    },
    {
      key: "balance_due",
      header: t("billing.balance"),
      render: (invoice) => <span>{formatCurrency(Number(invoice.balance_due), locale)}</span>,
    },
    {
      key: "invoice_date",
      header: t("common.date"),
      sortable: true,
      render: (invoice) => formatDate(invoice.invoice_date, locale),
    },
    {
      key: "due_date",
      header: t("billing.due"),
      render: (invoice) => (
        invoice.due_date ? formatDate(invoice.due_date, locale) : <span className="text-muted-foreground">-</span>
      ),
    },
    {
      key: "status",
      header: t("common.status"),
      sortable: true,
      render: (invoice) => (
        <StatusBadge variant={statusVariant[invoice.status] ?? "default"}>
          {getStatusLabel(invoice.status, t)}
        </StatusBadge>
      ),
    },
    {
      key: "actions",
      header: t("common.actions"),
      render: (invoice) => (
        <div className="flex flex-wrap justify-end gap-2">
          {invoice.status !== "void" && Number(invoice.balance_due) > 0 ? (
            <Button
              onClick={() => setSelectedInvoice(invoice)}
              variant="outline"
              size="sm"
              className="gap-1"
            >
              <Wallet className="h-4 w-4" />
              {t("billing.payment.action")}
            </Button>
          ) : null}
          {Number(invoice.amount_paid) > 0 && invoice.status !== "void" ? (
            <>
              <Button
                onClick={() => setRefundInvoice(invoice)}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <RotateCcw className="h-4 w-4" />
                {t("billing.integrity.refundAction")}
              </Button>
              <Button
                onClick={() => setReversalInvoice(invoice)}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <Ban className="h-4 w-4" />
                {t("billing.integrity.reversalAction")}
              </Button>
            </>
          ) : null}
          {invoice.status !== "void" && Number(invoice.amount_paid) === 0 && Number(invoice.balance_due) > 0 ? (
            <Button
              onClick={() => setWriteOffInvoice(invoice)}
              variant="outline"
              size="sm"
              className="gap-1"
            >
              <FileX className="h-4 w-4" />
              {t("billing.integrity.writeOffAction")}
            </Button>
          ) : null}
          {invoice.status !== "void" && Number(invoice.amount_paid) === 0 ? (
            <Button
              onClick={() => {
                setVoidInvoice(invoice);
                setVoidReason("");
              }}
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive hover:bg-destructive/10"
            >
              <Ban className="h-4 w-4" />
              {t("billing.status.void")}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <PageContainer className="space-y-6">
      <SectionHeader
        title={t("billing.title")}
        actions={(
          <PermissionGuard permission="manage_billing">
            <Button onClick={() => setShowModal(true)}><Plus className="h-4 w-4" /> {t("billing.newInvoice")}</Button>
          </PermissionGuard>
        )}
      />

      {!effectiveTenantId ? (
        <Alert variant="destructive">
          <AlertTitle>{t("billing.tenantContextRequiredTitle")}</AlertTitle>
          <AlertDescription>{t("billing.tenantContextRequiredDescription")}</AlertDescription>
        </Alert>
      ) : null}

      {(listQuery.isError || summaryQuery.isError || monthQuery.isError) && billingErrorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>{t("common.error")}</AlertTitle>
          <AlertDescription>{billingErrorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <FinancialIntegrityPanel />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={t("billing.totalRevenue")} value={formatCurrency(totalRevenue, locale)} icon={DollarSign} />
        <StatCard title={t("billing.pendingPayments")} value={formatCurrency(pendingAmount, locale)} icon={CreditCard} />
        <StatCard title={t("billing.invoicesThisMonth")} value={String(invoicesThisMonth)} icon={FileText} />
        <StatCard title={t("billing.collectionRate")} value={totalCollectedAndOutstanding ? `${collectionRate}%` : "-"} icon={TrendingUp} />
      </div>

      <DataTable
        columns={columns}
        data={invoices}
        keyExtractor={(invoice) => invoice.id}
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
        exportFileName="invoices"
        pdfExport={{
          title: t("billing.title"),
          subtitle: `${t("billing.totalRevenue")}: ${formatCurrency(totalRevenue, locale)} | ${t("billing.pendingPayments")}: ${formatCurrency(pendingAmount, locale)}`,
        }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        filterSlot={(
          <StatusFilter
            options={[
              { value: "paid", label: getStatusLabel("paid", t) },
              { value: "pending", label: getStatusLabel("pending", t) },
              { value: "overdue", label: getStatusLabel("overdue", t) },
              { value: "partially_paid", label: getStatusLabel("partially_paid", t) },
              { value: "void", label: getStatusLabel("void", t) },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        )}
      />

      <NewInvoiceModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={() => {
          invalidateInvoices();
        }}
      />

      <PostPaymentDialog
        invoice={selectedInvoice}
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onSuccess={invalidateInvoices}
      />

      <RefundDialog
        invoice={refundInvoice}
        open={!!refundInvoice}
        onClose={() => setRefundInvoice(null)}
        onSuccess={invalidateInvoices}
      />

      <WriteOffDialog
        invoice={writeOffInvoice}
        open={!!writeOffInvoice}
        onClose={() => setWriteOffInvoice(null)}
        onSuccess={invalidateInvoices}
      />

      <PaymentReversalDialog
        invoice={reversalInvoice}
        open={!!reversalInvoice}
        onClose={() => setReversalInvoice(null)}
        onSuccess={invalidateInvoices}
      />

      <Dialog open={!!voidInvoice} onOpenChange={(next) => !next && setVoidInvoice(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("billing.void.title")}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t("billing.void.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{voidInvoice?.invoice_code}</div>
              <div className="text-muted-foreground">{voidInvoice?.patients?.full_name ?? "-"}</div>
            </div>
            <div className="space-y-2">
              <Label>{t("billing.void.reasonRequiredLabel")}</Label>
              <Textarea
                rows={4}
                value={voidReason}
                onChange={(event) => setVoidReason(event.target.value)}
                placeholder={t("billing.void.reasonPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setVoidInvoice(null);
                setVoidReason("");
              }}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleVoidInvoice()}
              disabled={voiding}
            >
              {voiding ? t("common.loading") : t("billing.void.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};
