import { useI18n } from "@/core/i18n/i18nStore";
import { Button } from "@/components/ui/button";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { UserPlus } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

interface UsersTabProps {
  profiles: (Tables<"profiles"> & { user_roles?: { role: string }[] })[];
  isDemo: boolean;
  onAddUser: () => void;
}

export const UsersTab = ({ profiles, isDemo, onAddUser }: UsersTabProps) => {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{t("settings.usersRoles")}</h3>
          <p className="text-sm text-muted-foreground">{t("settings.manageStaff")}</p>
        </div>
        <PermissionGuard permission="manage_users">
          <Button onClick={onAddUser} size="sm">
            <UserPlus className="h-4 w-4" /> {t("settings.addUser")}
          </Button>
        </PermissionGuard>
      </div>
      <PermissionGuard
        permission="manage_users"
        fallback={<p className="text-muted-foreground">{t("settings.noPermission")}</p>}
      >
        <div className="space-y-3">
          {isDemo ? (
            ["Dr. Sarah Ahmed - Admin", "Dr. John Smith - Doctor", "Emily Davis - Receptionist"].map((u, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm">{u}</span>
                <Button variant="outline" size="sm">{t("common.edit")}</Button>
              </div>
            ))
          ) : profiles.length > 0 ? (
            profiles.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                    {p.full_name.charAt(0)}
                  </div>
                  <div>
                    <span className="text-sm font-medium">{p.full_name}</span>
                    <span className="text-xs text-muted-foreground ml-2 capitalize bg-muted px-2 py-0.5 rounded">
                      {(p as any).user_roles?.[0]?.role?.replace("_", " ") ?? "—"}
                    </span>
                  </div>
                </div>
                <Button variant="outline" size="sm">{t("common.edit")}</Button>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm py-4 text-center">{t("common.noUsersFound")}</p>
          )}
        </div>
      </PermissionGuard>
    </div>
  );
};
