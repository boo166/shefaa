import { useI18n } from "@/core/i18n/i18nStore";
import type { OperationsCenterSnapshot } from "@/services/dashboard/dashboardOps.service";
import { FlaskConical, AlertTriangle, Pill, PackageMinus } from "lucide-react";
import { HealthSection, HealthStat } from "./HealthSection";

type ClinicalHealthSectionProps = {
  data: OperationsCenterSnapshot["clinical"];
};

export function ClinicalHealthSection({ data }: ClinicalHealthSectionProps) {
  const { t } = useI18n(["dashboard"]);

  return (
    <HealthSection
      title={t("dashboard.ops.clinicalHealth.title")}
      description={t("dashboard.ops.clinicalHealth.description")}
    >
      <HealthStat
        title={t("dashboard.ops.clinicalHealth.pendingLabs")}
        value={data.pendingLabs}
        icon={FlaskConical}
        accent="warning"
      />
      <HealthStat
        title={t("dashboard.ops.clinicalHealth.criticalLabResults")}
        value={data.criticalLabResults}
        icon={AlertTriangle}
        accent="destructive"
      />
      <HealthStat
        title={t("dashboard.ops.clinicalHealth.activePrescriptions")}
        value={data.activePrescriptions}
        icon={Pill}
        accent="info"
      />
      <HealthStat
        title={t("dashboard.ops.clinicalHealth.lowStockAlerts")}
        value={data.lowStockAlerts}
        icon={PackageMinus}
        accent="warning"
      />
    </HealthSection>
  );
}
