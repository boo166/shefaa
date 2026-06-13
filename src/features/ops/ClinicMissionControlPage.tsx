import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { PageContainer, SectionHeader } from "@/components/layout/AppLayout";
import { Button } from "@/components/primitives/Button";
import { Loader2 } from "lucide-react";
import { clinicOpsService } from "@/services/ops/clinicOps.service";
import { ReconciliationFindingsPanel } from "./shared/ReconciliationFindingsPanel";
import { OpsAlertsPanel } from "./shared/OpsAlertsPanel";
import { CrossDomainReconPanel } from "./shared/CrossDomainReconPanel";
import { OperationalFeedPanel } from "./shared/OperationalFeedPanel";

export function ClinicMissionControlPage() {
  const { t } = useI18n(["ops", "common"]);
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const canAccess = hasPermission("manage_clinic") || hasPermission("view_billing") || hasPermission("manage_billing");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["clinicOps", user?.tenantId],
    queryFn: () => clinicOpsService.getSnapshot(),
    enabled: !!user?.tenantId && canAccess,
    refetchInterval: 60_000,
  });

  const handleAcknowledge = async (findingId: string) => {
    setAcknowledgingId(findingId);
    try {
      await clinicOpsService.acknowledgeBillingFinding(findingId);
      await queryClient.invalidateQueries({ queryKey: ["clinicOps", user?.tenantId] });
    } finally {
      setAcknowledgingId(null);
    }
  };

  if (!canAccess) {
    return (
      <PageContainer>
        <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          {t("ops.accessDenied")}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader
          title={t("ops.title")}
          subtitle={t("ops.subtitle")}
        />
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("ops.refresh")}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin me-2" />
          {t("ops.loading")}
        </div>
      ) : isError || !data ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          {t("ops.loadError")}
        </div>
      ) : (
        <div className="space-y-6">
          <CrossDomainReconPanel
            title={t("ops.reconciliation.title")}
            data={data.crossDomain}
            labels={{
              billing: t("ops.reconciliation.billing"),
              patients: t("ops.reconciliation.patients"),
              notifications: t("ops.reconciliation.notifications"),
              appointments: t("ops.reconciliation.appointments"),
              findings: t("ops.reconciliation.findings"),
              critical: t("ops.reconciliation.critical"),
            }}
          />

          <OpsAlertsPanel
            title={t("ops.alerts.title")}
            alerts={data.alerts}
            labels={{
              deadLetters: t("ops.alerts.deadLetters"),
              failedDeliveries: t("ops.alerts.failedDeliveries"),
              queueDrift: t("ops.alerts.queueDrift"),
              retentionFindings: t("ops.alerts.retentionFindings"),
            }}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ReconciliationFindingsPanel
              title={t("ops.findings.billing")}
              findings={data.billingFindings}
              onAcknowledge={hasPermission("manage_billing") || hasPermission("manage_clinic") ? handleAcknowledge : undefined}
              acknowledgingId={acknowledgingId}
              emptyLabel={t("ops.findings.empty")}
            />
            <OperationalFeedPanel
              title={t("ops.feed.title")}
              items={data.operationalFeed}
              emptyLabel={t("ops.feed.empty")}
            />
          </div>
        </div>
      )}
    </PageContainer>
  );
}
