import { useI18n } from "@/core/i18n/i18nStore";
import { formatDate } from "@/shared/utils/formatDate";
import type { OperationsCenterSnapshot } from "@/services/dashboard/dashboardOps.service";
import { Bell, Skull, AlertOctagon, GitCompare, History } from "lucide-react";
import { HealthSection, HealthStat } from "./HealthSection";

type SystemHealthSectionProps = {
  data: OperationsCenterSnapshot["system"];
};

export function SystemHealthSection({ data }: SystemHealthSectionProps) {
  const { t, locale, calendarType } = useI18n(["dashboard"]);

  return (
    <HealthSection
      title={t("dashboard.ops.systemHealth.title")}
      description={t("dashboard.ops.systemHealth.description")}
    >
      <HealthStat
        title={t("dashboard.ops.systemHealth.notificationsDelivered")}
        value={data.notificationsDelivered}
        icon={Bell}
        accent="success"
      />
      <HealthStat
        title={t("dashboard.ops.systemHealth.deadLetters")}
        value={data.deadLetters}
        icon={Skull}
        accent={data.deadLetters > 0 ? "destructive" : "primary"}
      />
      <HealthStat
        title={t("dashboard.ops.systemHealth.failedEvents")}
        value={data.failedEvents}
        icon={AlertOctagon}
        accent={data.failedEvents > 0 ? "warning" : "primary"}
      />
      <HealthStat
        title={t("dashboard.ops.systemHealth.queueDivergence")}
        value={data.queueDivergence}
        icon={GitCompare}
        accent={data.queueDivergence > 0 ? "warning" : "primary"}
      />
      <HealthStat
        title={t("dashboard.ops.systemHealth.lastReconciliation")}
        value={data.lastReconciliationAt
          ? formatDate(data.lastReconciliationAt, locale, "datetime", calendarType)
          : t("dashboard.ops.systemHealth.never")}
        icon={History}
        accent="info"
      />
    </HealthSection>
  );
}
