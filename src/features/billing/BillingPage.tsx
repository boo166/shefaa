import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { DataTable, Column } from "@/shared/components/DataTable";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { DollarSign, CreditCard, FileText, TrendingUp, Plus } from "lucide-react";

interface Invoice {
  id: string;
  patient: string;
  service: string;
  amount: number;
  date: string;
  status: "paid" | "pending" | "overdue";
}

const DEMO_INVOICES: Invoice[] = [
  { id: "INV-001", patient: "Mohammed Al-Rashid", service: "Cardiology Consultation", amount: 350, date: "2026-03-08", status: "paid" },
  { id: "INV-002", patient: "Fatima Hassan", service: "Follow-up Visit", amount: 150, date: "2026-03-07", status: "paid" },
  { id: "INV-003", patient: "Ali Mansour", service: "Lab Work - Complete Panel", amount: 520, date: "2026-03-06", status: "pending" },
  { id: "INV-004", patient: "Noor Ibrahim", service: "Pediatric Check-up", amount: 200, date: "2026-03-05", status: "overdue" },
  { id: "INV-005", patient: "Khalid Omar", service: "X-Ray + Consultation", amount: 480, date: "2026-03-04", status: "paid" },
  { id: "INV-006", patient: "Sara Al-Fahad", service: "Dermatology Treatment", amount: 300, date: "2026-03-03", status: "pending" },
];

const statusVariant = { paid: "success", pending: "warning", overdue: "destructive" } as const;

export const BillingPage = () => {
  const { t } = useI18n();

  const columns: Column<Invoice>[] = [
    { key: "id", header: "Invoice #", render: (inv) => <span className="font-medium">{inv.id}</span> },
    { key: "patient", header: t("appointments.patient") },
    { key: "service", header: "Service" },
    { key: "amount", header: "Amount", render: (inv) => <span className="font-semibold">${inv.amount}</span> },
    { key: "date", header: t("common.date") },
    { key: "status", header: t("common.status"), render: (inv) => <StatusBadge variant={statusVariant[inv.status]}>{inv.status}</StatusBadge> },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("common.billing")}</h1>
        <PermissionGuard permission="manage_billing">
          <Button><Plus className="h-4 w-4" /> New Invoice</Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Revenue" value="$48,250" icon={DollarSign} trend={{ value: 12, positive: true }} />
        <StatCard title="Pending Payments" value="$3,420" icon={CreditCard} />
        <StatCard title="Invoices This Month" value="86" icon={FileText} trend={{ value: 8, positive: true }} />
        <StatCard title="Collection Rate" value="94.2%" icon={TrendingUp} />
      </div>

      <DataTable columns={columns} data={DEMO_INVOICES} keyExtractor={(inv) => inv.id} />
    </div>
  );
};
