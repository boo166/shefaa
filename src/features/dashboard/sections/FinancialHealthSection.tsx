import { useI18n } from "@/core/i18n/i18nStore";
import { formatCurrency } from "@/shared/utils/formatDate";
import type { OperationsCenterSnapshot } from "@/services/dashboard/dashboardOps.service";
import { DollarSign, Wallet, RotateCcw, FileX, ShieldCheck } from "lucide-react";
import { HealthSection, HealthStat } from "./HealthSection";
import { StatusBadge } from "@/shared/components/StatusBadge";

type FinancialHealthSectionProps = {
  data: OperationsCenterSnapshot["financial"];
};

function reconVariant(status: OperationsCenterSnapshot["financial"]["reconciliationStatus"]) {
  if (status === "clean") return "success" as const;
  if (status === "warning") return "warning" as const;
  return "destructive" as const;
}

export function FinancialHealthSection({ data }: FinancialHealthSectionProps) {
  const { t, locale } = useI18n(["dashboard"]);

  const reconText = data.reconciliationStatus === "clean"
    ? t("dashboard.ops.financialHealth.reconClean")
    : data.reconciliationStatus === "warning"
      ? t("dashboard.ops.financialHealth.reconFindings", { count: data.openFindingCount })
      : t("dashboard.ops.financialHealth.reconCritical");

  return (
    <HealthSection
      title={t("dashboard.ops.financialHealth.title")}
      description={t("dashboard.ops.financialHealth.description")}
    >
      <HealthStat
        title={t("dashboard.ops.financialHealth.revenueToday")}
        value={formatCurrency(data.revenueToday, locale)}
        icon={DollarSign}
        accent="success"
      />
      <HealthStat
        title={t("dashboard.ops.financialHealth.outstandingBalance")}
        value={formatCurrency(data.outstandingBalance, locale)}
        icon={Wallet}
        accent="warning"
      />
      <HealthStat
        title={t("dashboard.ops.financialHealth.refundsToday")}
        value={formatCurrency(data.refundsToday, locale)}
        icon={RotateCcw}
        accent="info"
      />
      <HealthStat
        title={t("dashboard.ops.financialHealth.writeOffsToday")}
        value={formatCurrency(data.writeOffsToday, locale)}
        icon={FileX}
        accent="destructive"
      />
      <div className="stat-card shadow-none border bg-background/60 flex flex-col justify-between">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            {t("dashboard.ops.financialHealth.reconciliationStatus")}
          </span>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg text-primary bg-primary/10">
            <ShieldCheck className="h-4 w-4" />
          </div>
        </div>
        <StatusBadge variant={reconVariant(data.reconciliationStatus)} dot className="w-fit">
          {reconText}
        </StatusBadge>
        {data.openFindingCount > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("dashboard.ops.financialHealth.openFindings", { count: data.openFindingCount })}
          </p>
        ) : null}
      </div>
    </HealthSection>
  );
}
