import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/primitives/Button";
import { billingReconciliationService } from "@/services/billing/billingReconciliation";
import { Loader2 } from "lucide-react";

export function FinancialIntegrityPanel() {
  const { t } = useI18n(["billing"]);
  const { clinicSlug } = useParams();
  const { user } = useAuth();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["billingIntegrity", user?.tenantId],
    queryFn: () => billingReconciliationService.getOpsSnapshot(),
    enabled: !!user?.tenantId,
  });

  const openCount = data?.openFindings.length ?? 0;
  const criticalCount = data?.openFindings.filter((f) => f.severity === "critical").length ?? 0;
  const status = criticalCount > 0 ? "critical" : openCount > 0 ? "warning" : "clean";

  const statusLabel = status === "clean"
    ? t("billing.integrity.statusClean")
    : t("billing.integrity.statusFindings", { count: openCount });

  const variant = status === "clean" ? "success" : status === "warning" ? "warning" : "destructive";

  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("billing.integrity.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("billing.integrity.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge variant={variant} dot>{statusLabel}</StatusBadge>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("billing.integrity.refresh")}
          </Button>
          {clinicSlug ? (
            <Link to={`/tenant/${clinicSlug}/ops`} className="inline-flex">
              <Button variant="outline" size="sm">{t("billing.integrity.viewOps")}</Button>
            </Link>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
      ) : openCount === 0 ? (
        <p className="text-sm text-muted-foreground">{t("billing.integrity.noFindings")}</p>
      ) : (
        <ul className="space-y-2">
          {data?.openFindings.slice(0, 5).map((finding) => (
            <li key={finding.id} className="rounded-lg border p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={finding.severity === "critical" ? "destructive" : "warning"}>{finding.severity}</StatusBadge>
                <span className="font-medium">{finding.finding_code}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
