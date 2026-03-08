import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { cn } from "@/lib/utils";
import { Building, Users, Bell, Palette } from "lucide-react";

type Tab = "general" | "users" | "notifications" | "appearance";

const tabs: { key: Tab; icon: any; label: string }[] = [
  { key: "general", icon: Building, label: "General" },
  { key: "users", icon: Users, label: "Users & Roles" },
  { key: "notifications", icon: Bell, label: "Notifications" },
  { key: "appearance", icon: Palette, label: "Appearance" },
];

export const SettingsPage = () => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("general");

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("common.settings")}</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-56 flex lg:flex-col gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-card rounded-lg border p-6 max-w-2xl">
          {activeTab === "general" && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Clinic Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Clinic Name</Label>
                  <Input defaultValue={user?.tenantName ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input defaultValue={tenant?.slug ?? ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input defaultValue="+966 11 234 5678" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input defaultValue="info@democlini.com" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input defaultValue="123 King Fahd Road, Riyadh, Saudi Arabia" />
              </div>
              <div className="flex items-center gap-4">
                <Label>Language</Label>
                <LanguageSwitcher />
              </div>
              <Button>{t("common.save")}</Button>
            </div>
          )}

          {activeTab === "users" && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Users & Roles</h3>
              <p className="text-sm text-muted-foreground">Manage clinic staff and their permissions.</p>
              <PermissionGuard permission="manage_users" fallback={<p className="text-muted-foreground">You don't have permission to manage users.</p>}>
                <div className="space-y-3">
                  {["Dr. Sarah Ahmed - Admin", "Dr. John Smith - Doctor", "Emily Davis - Receptionist", "Nurse Mary - Nurse", "Ahmed Ali - Accountant"].map((u, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                      <span className="text-sm">{u}</span>
                      <Button variant="outline" size="sm">{t("common.edit")}</Button>
                    </div>
                  ))}
                </div>
              </PermissionGuard>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Notification Preferences</h3>
              {["Appointment Reminders", "Lab Results Ready", "Billing Alerts", "System Updates"].map((pref, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm">{pref}</span>
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-input accent-primary" />
                </div>
              ))}
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Appearance</h3>
              <p className="text-sm text-muted-foreground">Customize the look and feel of your clinic dashboard.</p>
              <div className="p-6 rounded-lg bg-muted/50 text-center text-muted-foreground">
                Theme customization coming soon
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
