import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { dashboardOpsService } from "@/services/dashboard/dashboardOps.service";
import { queryKeys } from "@/services/queryKeys";
import { Loader2 } from "lucide-react";
import { ClinicHealthSection } from "./sections/ClinicHealthSection";
import { FinancialHealthSection } from "./sections/FinancialHealthSection";
import { ClinicalHealthSection } from "./sections/ClinicalHealthSection";
import { SystemHealthSection } from "./sections/SystemHealthSection";

export function OperationsCenter() {
  const { t } = useI18n(["dashboard"]);
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  const { data, isLoading, isError } = useQuery({
    queryKey: [...queryKeys.reports.overview(tenantId), "operationsCenter"],
    queryFn: () => dashboardOpsService.getOperationsCenterSnapshot(),
    enabled: !!tenantId,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin me-2" />
        {t("dashboard.ops.loading")}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {t("dashboard.ops.loadError")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ClinicHealthSection data={data.clinic} />
      <FinancialHealthSection data={data.financial} />
      <ClinicalHealthSection data={data.clinical} />
      <SystemHealthSection data={data.system} />
    </div>
  );
}
