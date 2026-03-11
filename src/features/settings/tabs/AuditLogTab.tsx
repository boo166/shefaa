import { useMemo } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { formatDate } from "@/shared/utils/formatDate";
import { Loader2, ShieldCheck, UserPlus, Building } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { auditLogService } from "@/services/settings/audit.service";
import { queryKeys } from "@/services/queryKeys";
import type { AuditLog } from "@/domain/settings/audit.types";

const ACTION_ICONS: Record<string, typeof ShieldCheck> = {
  clinic_created: Building,
  staff_invited: UserPlus,
};

export const AuditLogTab = () => {
  const { t, locale, calendarType } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";

  const { data: logs = [], isLoading } = useQuery({
    queryKey: queryKeys.settings.audit(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => auditLogService.listRecent(50),
  });

  const entries: AuditLog[] = useMemo(() => logs, [logs]);

  const formatAction = (action: string) =>
    action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-lg">{t("settings.auditLog")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.auditLogDesc")}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">{t("settings.noAuditLogs")}</p>
      ) : (
        <div className="space-y-2">
          {entries.map((log) => {
            const Icon = ACTION_ICONS[log.action] ?? ShieldCheck;
            return (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg border">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatAction(log.action)}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.entity_type} - {formatDate(log.created_at, locale, "datetime", calendarType)}
                  </p>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded truncate">
                      {Object.entries(log.details)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" - ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
