import { useI18n } from "@/core/i18n/i18nStore";
import type { OperationsCenterSnapshot } from "@/services/dashboard/dashboardOps.service";
import { Clock, UserCheck, CheckCircle2, XCircle, Stethoscope } from "lucide-react";
import { HealthSection, HealthStat } from "./HealthSection";

type ClinicHealthSectionProps = {
  data: OperationsCenterSnapshot["clinic"];
};

export function ClinicHealthSection({ data }: ClinicHealthSectionProps) {
  const { t } = useI18n(["dashboard"]);

  return (
    <HealthSection
      title={t("dashboard.ops.clinicHealth.title")}
      description={t("dashboard.ops.clinicHealth.description")}
    >
      <HealthStat
        title={t("dashboard.ops.clinicHealth.waitingNow")}
        value={data.waitingNow}
        icon={Clock}
        accent="warning"
      />
      <HealthStat
        title={t("dashboard.ops.clinicHealth.inService")}
        value={data.inService}
        icon={UserCheck}
        accent="info"
      />
      <HealthStat
        title={t("dashboard.ops.clinicHealth.completedToday")}
        value={data.completedToday}
        icon={CheckCircle2}
        accent="success"
      />
      <HealthStat
        title={t("dashboard.ops.clinicHealth.noShowRate")}
        value={`${data.noShowRate.toFixed(1)}%`}
        icon={XCircle}
        accent="destructive"
      />
      <HealthStat
        title={t("dashboard.ops.clinicHealth.doctorsOnline")}
        value={data.doctorsOnline}
        icon={Stethoscope}
        accent="primary"
      />
    </HealthSection>
  );
}
