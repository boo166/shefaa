import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { cn } from "@/lib/utils";
import { Building, Users, Bell, Palette, Shield, ScrollText, User } from "lucide-react";
import { AddUserModal } from "./AddUserModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GeneralTab } from "./tabs/GeneralTab";
import { UsersTab } from "./tabs/UsersTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { AuditLogTab } from "./tabs/AuditLogTab";
import { ProfileTab } from "./tabs/ProfileTab";
import { fetchProfilesWithRoles } from "@/shared/data/profiles";

type Tab = "profile" | "general" | "users" | "notifications" | "appearance" | "security" | "audit";

export const SettingsPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [showAddUser, setShowAddUser] = useState(false);

  const profilesQueryKey = ["profiles-with-roles", user?.tenantId];
  const { data: profiles = [], refetch: refetchProfiles } = useQuery({
    queryKey: profilesQueryKey,
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => fetchProfilesWithRoles({ tenantId: user?.tenantId }),
  });

  const tabs: { key: Tab; icon: any; label: string }[] = [
    { key: "profile", icon: User, label: t("settings.profile") },
    { key: "general", icon: Building, label: t("settings.general") },
    { key: "users", icon: Users, label: t("settings.usersRoles") },
    { key: "security", icon: Shield, label: t("settings.security") },
    { key: "notifications", icon: Bell, label: t("common.notifications") },
    { key: "appearance", icon: Palette, label: t("settings.appearance") },
    { key: "audit", icon: ScrollText, label: t("settings.auditLog") },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("settings.title")}</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-56 flex lg:flex-col gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-card rounded-lg border p-6 max-w-2xl">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "users" && (
            <UsersTab
              profiles={profiles}
              isDemo={isDemo}
              onAddUser={() => setShowAddUser(true)}
            />
          )}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "audit" && <AuditLogTab />}
        </div>
      </div>

      <AddUserModal
        open={showAddUser}
        onClose={() => setShowAddUser(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: profilesQueryKey });
          refetchProfiles();
        }}
      />
    </div>
  );
};
