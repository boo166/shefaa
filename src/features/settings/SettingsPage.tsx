import { useState, useEffect } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PermissionGuard } from "@/core/auth/PermissionGuard";
import { cn } from "@/lib/utils";
import { Building, Users, Bell, Palette, Loader2, UserPlus, Shield, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useSupabaseTable } from "@/hooks/useSupabaseQuery";
import { Tables } from "@/integrations/supabase/types";
import { AddUserModal } from "./AddUserModal";
import { useQueryClient } from "@tanstack/react-query";
import { useDarkMode } from "@/hooks/useDarkMode";

type Tab = "general" | "users" | "notifications" | "appearance" | "security";

export const SettingsPage = () => {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const isDemo = user?.tenantId === "demo";
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [saving, setSaving] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  // Clinic info form
  const [clinicName, setClinicName] = useState(user?.tenantName ?? "");
  const [clinicPhone, setClinicPhone] = useState("");
  const [clinicEmail, setClinicEmail] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification settings
  const [notifSettings, setNotifSettings] = useState({
    appointmentReminders: true,
    labResultsReady: true,
    billingAlerts: true,
    systemUpdates: false,
  });

  // Load tenant data
  useEffect(() => {
    if (isDemo || !user?.tenantId) return;
    supabase.from("tenants").select("*").eq("id", user.tenantId).single().then(({ data }) => {
      if (data) {
        setClinicName(data.name);
        setClinicPhone(data.phone ?? "");
        setClinicEmail(data.email ?? "");
        setClinicAddress(data.address ?? "");
      }
    });
  }, [user?.tenantId, isDemo]);

  const { data: profiles = [], refetch: refetchProfiles } = useSupabaseTable<Tables<"profiles"> & { user_roles?: { role: string }[] }>("profiles" as any, {
    select: "*, user_roles(role)",
    enabled: !isDemo,
  });

  const handleSaveGeneral = async () => {
    if (isDemo) {
      toast({ title: "Demo mode", description: "Settings cannot be saved in demo mode.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("tenants").update({
      name: clinicName,
      phone: clinicPhone || null,
      email: clinicEmail || null,
      address: clinicAddress || null,
    }).eq("id", user?.tenantId ?? "");

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Saved", description: "Settings saved successfully" });
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (isDemo) {
      toast({ title: "Demo mode", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password changed", description: "Your password has been updated." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setChangingPassword(false);
  };

  const tabs: { key: Tab; icon: any; label: string }[] = [
    { key: "general", icon: Building, label: t("settings.general") },
    { key: "users", icon: Users, label: t("settings.usersRoles") },
    { key: "security", icon: Shield, label: "Security" },
    { key: "notifications", icon: Bell, label: t("common.notifications") },
    { key: "appearance", icon: Palette, label: t("settings.appearance") },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">{t("settings.title")}</h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-56 flex lg:flex-col gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn("flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                activeTab === tab.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <tab.icon className="h-4 w-4" />{tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-card rounded-lg border p-6 max-w-2xl">
          {activeTab === "general" && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">{t("settings.clinicInfo")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("settings.clinicName")}</Label>
                  <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("settings.slug")}</Label>
                  <Input defaultValue={user?.tenantSlug ?? ""} disabled />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.phone")}</Label>
                  <Input value={clinicPhone} onChange={(e) => setClinicPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{t("common.email")}</Label>
                  <Input value={clinicEmail} onChange={(e) => setClinicEmail(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("settings.address")}</Label>
                <Input value={clinicAddress} onChange={(e) => setClinicAddress(e.target.value)} />
              </div>
              <div className="flex items-center gap-4">
                <Label>{t("common.language")}</Label>
                <LanguageSwitcher />
              </div>
              <Button onClick={handleSaveGeneral} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          )}

          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{t("settings.usersRoles")}</h3>
                  <p className="text-sm text-muted-foreground">{t("settings.manageStaff")}</p>
                </div>
                <PermissionGuard permission="manage_users">
                  <Button onClick={() => setShowAddUser(true)} size="sm">
                    <UserPlus className="h-4 w-4" /> Add User
                  </Button>
                </PermissionGuard>
              </div>
              <PermissionGuard permission="manage_users" fallback={<p className="text-muted-foreground">{t("settings.noPermission")}</p>}>
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
                    <p className="text-muted-foreground text-sm py-4 text-center">No users found</p>
                  )}
                </div>
              </PermissionGuard>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Change Password</h3>
              <div className="space-y-4 max-w-sm">
                <div className="space-y-2">
                  <Label>New Password</Label>
                  <div className="relative">
                    <Input
                      type={showPasswords ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords(!showPasswords)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Confirm New Password</Label>
                  <Input
                    type={showPasswords ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                  />
                </div>
                <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
                  {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update Password
                </Button>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-medium text-sm text-destructive mb-2">Danger Zone</h4>
                <Button variant="outline" className="text-destructive border-destructive/50" onClick={logout}>
                  Sign Out
                </Button>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">{t("settings.notifPreferences")}</h3>
              {[
                { key: "appointmentReminders", label: t("settings.appointmentReminders") },
                { key: "labResultsReady", label: t("settings.labResultsReady") },
                { key: "billingAlerts", label: t("settings.billingAlerts") },
                { key: "systemUpdates", label: t("settings.systemUpdates") },
              ].map((pref) => (
                <div key={pref.key} className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm">{pref.label}</span>
                  <input
                    type="checkbox"
                    checked={(notifSettings as any)[pref.key]}
                    onChange={(e) => setNotifSettings({ ...notifSettings, [pref.key]: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                </div>
              ))}
              <Button onClick={() => toast({ title: "Preferences saved" })}>Save Preferences</Button>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">{t("settings.appearance")}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm">Dark Mode</span>
                  <span className="text-xs text-muted-foreground">Coming soon</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <span className="text-sm">Compact View</span>
                  <span className="text-xs text-muted-foreground">Coming soon</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddUserModal
        open={showAddUser}
        onClose={() => setShowAddUser(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["profiles"] });
          refetchProfiles();
        }}
      />
    </div>
  );
};
