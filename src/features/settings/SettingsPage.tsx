import { useEffect, useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { cn } from "@/lib/utils";
import { Building, Users, Bell, Palette, Shield, ScrollText, User, CreditCard } from "lucide-react";
import { Button } from "@/components/primitives/Button";
import { PageContainer, SectionHeader } from "@/components/layout/AppLayout";
import { AddUserModal } from "./AddUserModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GeneralTab } from "./tabs/GeneralTab";
import { UsersTab } from "./tabs/UsersTab";
import { SecurityTab } from "./tabs/SecurityTab";
import { NotificationsTab } from "./tabs/NotificationsTab";
import { AppearanceTab } from "./tabs/AppearanceTab";
import { AuditLogTab } from "./tabs/AuditLogTab";
import { ProfileTab } from "./tabs/ProfileTab";
import { SubscriptionTab } from "./tabs/SubscriptionTab";
import { settingsUsersService } from "@/services/settings/users.service";
import { queryKeys } from "@/services/queryKeys";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";

type Tab = "profile" | "general" | "users" | "notifications" | "appearance" | "security" | "audit" | "subscription";

export const SettingsPage = () => {
  const { t } = useI18n();
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [showAddUser, setShowAddUser] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState<{ column: "full_name" | "created_at"; direction: "asc" | "desc" }>({
    column: "created_at",
    direction: "desc",
  });
  const debouncedUserSearch = useDebouncedValue(userSearch, 300);
  const pageSize = 20;
  const canManageUsers = hasPermission("manage_users");

  useEffect(() => {
    setUserPage(1);
  }, [debouncedUserSearch, userSort]);

  const profilesQueryKey = queryKeys.settings.profiles({
    tenantId: user?.tenantId,
    page: userPage,
    pageSize,
    search: debouncedUserSearch.trim() || undefined,
    sort: userSort,
  });

  const { data: profilesResponse, refetch: refetchProfiles, isLoading: loadingProfiles } = useQuery({
    queryKey: profilesQueryKey,
    enabled: !!user?.tenantId && canManageUsers,
    queryFn: () =>
      settingsUsersService.listProfilesWithRolesPaged({
        page: userPage,
        pageSize,
        search: debouncedUserSearch.trim() || undefined,
        sort: userSort,
      }),
  });

  const profiles = profilesResponse?.data ?? [];
  const profilesTotal = profilesResponse?.total ?? 0;

  const tabs: { key: Tab; icon: any; label: string }[] = [
    { key: "profile", icon: User, label: t("settings.profile") },
    { key: "general", icon: Building, label: t("settings.general") },
    { key: "users", icon: Users, label: t("settings.usersRoles") },
    { key: "security", icon: Shield, label: t("settings.security") },
    { key: "notifications", icon: Bell, label: t("common.notifications") },
    { key: "appearance", icon: Palette, label: t("settings.appearance") },
    { key: "audit", icon: ScrollText, label: t("settings.auditLog") },
    { key: "subscription", icon: CreditCard, label: "الاشتراك" },
  ];

  return (
    <PageContainer className="space-y-5">
      <SectionHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle") ?? "Manage your clinic preferences"}
      />

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Tab navigation */}
        <div className="lg:w-52 flex lg:flex-col gap-0.5 overflow-x-auto pb-1 lg:pb-0">
          {tabs.map((tab) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              key={tab.key}
              data-testid={`settings-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              aria-pressed={activeTab === tab.key}
              className={cn(
                "w-full justify-start gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors whitespace-nowrap",
                activeTab === tab.key
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4 flex-shrink-0" />
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 bg-card rounded-xl border p-6 max-w-2xl">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "general" && <GeneralTab />}
          {activeTab === "users" && (
            <UsersTab
              profiles={profiles}
              onAddUser={() => setShowAddUser(true)}
              onUsersChanged={() => void refetchProfiles()}
              isLoading={loadingProfiles}
              page={userPage}
              pageSize={pageSize}
              total={profilesTotal}
              onPageChange={setUserPage}
              searchValue={userSearch}
              onSearchChange={setUserSearch}
              sortColumn={userSort.column}
              sortDirection={userSort.direction}
              onSortChange={(column, direction) => setUserSort({ column, direction })}
            />
          )}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "appearance" && <AppearanceTab />}
          {activeTab === "audit" && <AuditLogTab />}
          {activeTab === "subscription" && <SubscriptionTab />}
        </div>
      </div>

      <AddUserModal
        open={showAddUser}
        onClose={() => setShowAddUser(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["settings", user?.tenantId, "profiles"] });
          setUserPage(1);
          setUserSearch("");
          refetchProfiles();
        }}
      />
    </PageContainer>
  );
};
