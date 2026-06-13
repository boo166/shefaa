import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/core/i18n/i18nStore";
import { buildMfaComplianceSession, buildPrivilegedSession, useAuth } from "@/core/auth/authStore";
import { PageContainer, SectionHeader } from "@/components/layout/AppLayout";
import { auditLogService } from "@/services/settings/audit.service";
import { settingsUsersService } from "@/services/settings/users.service";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Loader2 } from "lucide-react";
import { PrivilegedMfaPanel } from "@/features/auth/PrivilegedMfaPanel";

export function SecurityCenterPage() {
  const { t } = useI18n(["security", "auth", "common", "settings"]);
  const { user, lastVerifiedAt, privilegedAuth } = useAuth();
  const privilegedSession = buildPrivilegedSession({ user, lastVerifiedAt, privilegedAuth });
  const mfaCompliance = buildMfaComplianceSession({ user, privilegedAuth });

  const identityAuditQuery = useQuery({
    queryKey: ["identityAudit", user?.tenantId],
    queryFn: () => auditLogService.listIdentityPaged({ page: 1, pageSize: 25 }),
    enabled: !!user?.tenantId,
  });

  const usersQuery = useQuery({
    queryKey: ["securityUsers", user?.tenantId],
    queryFn: () => settingsUsersService.listProfilesWithRolesPaged({ page: 1, pageSize: 50 }),
    enabled: !!user?.tenantId,
  });

  const suspendedUsers = (usersQuery.data?.data ?? []).filter(
    (profile) => profile.account_status === "suspended",
  );

  return (
    <PageContainer className="space-y-8">
      <SectionHeader title={t("security.title")} subtitle={t("security.subtitle")} />

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t("security.authentication.title")}</h2>
        <div className="grid gap-3 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-muted-foreground">{t("security.authentication.mfaRequired")}</p>
            <p className="font-medium">{mfaCompliance.mfaRequired ? t("security.common.yes") : t("security.common.no")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("security.authentication.mfaEnrolled")}</p>
            <p className="font-medium">{privilegedSession.isMfaEnrolled ? t("security.common.yes") : t("security.common.no")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("security.authentication.assurance")}</p>
            <p className="font-medium">{privilegedSession.aal ?? t("security.authentication.unknown")}</p>
          </div>
        </div>
        <PrivilegedMfaPanel mode="embedded" />
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t("security.users.title")}</h2>
        {usersQuery.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : suspendedUsers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("security.users.noSuspended")}</p>
        ) : (
          <ul className="space-y-2">
            {suspendedUsers.map((profile) => (
              <li key={profile.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                <span>{profile.full_name}</span>
                <StatusBadge variant="warning">{t("security.users.suspended")}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t("security.audit.title")}</h2>
        {identityAuditQuery.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pe-4">{t("security.audit.time")}</th>
                  <th className="py-2 pe-4">{t("security.audit.action")}</th>
                  <th className="py-2">{t("security.audit.actor")}</th>
                </tr>
              </thead>
              <tbody>
                {(identityAuditQuery.data?.data ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="py-2 pe-4 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="py-2 pe-4 font-mono text-xs">{row.action}</td>
                    <td className="py-2 font-mono text-xs">{row.actor_id ?? row.user_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(identityAuditQuery.data?.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground pt-4">{t("security.audit.empty")}</p>
            ) : null}
          </div>
        )}
      </section>
    </PageContainer>
  );
}
