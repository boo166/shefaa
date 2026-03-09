import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { useNavigate } from "react-router-dom";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { DataTable, Column } from "@/shared/components/DataTable";
import { StatusFilter } from "@/shared/components/StatusFilter";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import {
  Building2, Users, CreditCard, TrendingUp, Search, LogOut,
  BarChart3, Shield, Eye, ChevronRight, Crown, HeartPulse,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatDate, formatCurrency } from "@/shared/utils/formatDate";
import { fetchProfilesWithRoles } from "@/shared/data/profiles";

type AdminTab = "overview" | "clinics" | "users" | "subscriptions";

export const AdminDashboardPage = () => {
  const { t, locale } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [clinicFilter, setClinicFilter] = useState<string | null>(null);
  const [subFilter, setSubFilter] = useState<string | null>(null);

  // Fetch all tenants
  const { data: tenants = [], isLoading: loadingTenants } = useQuery({
    queryKey: ["admin-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch all profiles with roles
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: () => fetchProfilesWithRoles(),
  });

  // Fetch all subscriptions
  const { data: subscriptions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("*, tenants(name, slug)").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalClinics = tenants.length;
  const totalUsers = profiles.length;
  const activeSubs = subscriptions.filter((s: any) => s.status === "active").length;
  const totalRevenue = subscriptions.reduce((s: number, sub: any) => s + Number(sub.amount || 0), 0);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const tabs: { key: AdminTab; icon: any; label: string }[] = [
    { key: "overview", icon: BarChart3, label: "Overview" },
    { key: "clinics", icon: Building2, label: "Clinics" },
    { key: "users", icon: Users, label: "Users" },
    { key: "subscriptions", icon: CreditCard, label: "Subscriptions" },
  ];

  const clinicColumns: Column<any>[] = [
    { key: "name", header: "Clinic Name", searchable: true, render: (c) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{c.name?.charAt(0)}</div>
        <div>
          <p className="font-medium">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.slug}</p>
        </div>
      </div>
    )},
    { key: "email", header: "Email", searchable: true, render: (c) => c.email || "—" },
    { key: "phone", header: "Phone", render: (c) => c.phone || "—" },
    { key: "created_at", header: "Created", render: (c) => formatDate(c.created_at, locale, "date") },
    { key: "actions", header: "", render: (c) => (
      <Button variant="ghost" size="sm" onClick={() => navigate(`/tenant/${c.slug}/dashboard`)}>
        <Eye className="h-4 w-4" />
      </Button>
    )},
  ];

  const userColumns: Column<any>[] = [
    { key: "full_name", header: "Name", searchable: true, render: (p) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs">
          {p.full_name?.charAt(0) || "U"}
        </div>
        <span className="font-medium">{p.full_name}</span>
      </div>
    )},
    { key: "role", header: "Role", render: (p) => {
      const role = (p.user_roles as any)?.[0]?.role || "—";
      const variant = role === "clinic_admin" ? "info" : role === "super_admin" ? "destructive" : "default";
      return <StatusBadge variant={variant as any}>{role.replace("_", " ")}</StatusBadge>;
    }},
    { key: "tenant_id", header: "Clinic", render: (p) => {
      const tenant = tenants.find((t: any) => t.id === p.tenant_id);
      return tenant?.name || "—";
    }},
    { key: "created_at", header: "Joined", render: (p) => formatDate(p.created_at, locale, "date") },
  ];

  const subColumns: Column<any>[] = [
    { key: "tenant", header: "Clinic", searchable: true, render: (s) => (
      <div className="flex items-center gap-3">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="font-medium">{(s.tenants as any)?.name || "—"}</p>
          <p className="text-xs text-muted-foreground">{(s.tenants as any)?.slug || ""}</p>
        </div>
      </div>
    )},
    { key: "plan", header: "Plan", render: (s) => {
      const variant = s.plan === "enterprise" ? "info" : s.plan === "pro" ? "success" : "default";
      return <StatusBadge variant={variant as any}>{s.plan.charAt(0).toUpperCase() + s.plan.slice(1)}</StatusBadge>;
    }},
    { key: "amount", header: "Amount", render: (s) => s.amount > 0 ? `${s.currency} ${Number(s.amount).toLocaleString()}` : "Free" },
    { key: "billing_cycle", header: "Cycle", render: (s) => s.billing_cycle },
    { key: "status", header: "Status", render: (s) => (
      <StatusBadge variant={s.status === "active" ? "success" : s.status === "expired" ? "destructive" : "warning"}>
        {s.status}
      </StatusBadge>
    )},
    { key: "expires_at", header: "Expires", render: (s) => s.expires_at ? formatDate(s.expires_at, locale, "date") : "—" },
  ];

  const filteredClinics = clinicFilter ? tenants.filter((t: any) => {
    const sub = subscriptions.find((s: any) => s.tenant_id === t.id);
    return sub?.plan === clinicFilter;
  }) : tenants;

  const filteredSubs = subFilter ? subscriptions.filter((s: any) => s.plan === subFilter) : subscriptions;

  return (
    <div className="min-h-screen bg-background" dir={locale === "ar" ? "rtl" : "ltr"}>
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <HeartPulse className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-bold text-foreground">MedFlow Admin</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Crown className="h-3 w-3" /> Super Admin</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                {user?.name?.charAt(0) || "A"}
              </div>
              <span className="text-sm font-medium">{user?.name}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Tabs */}
        <div className="border-b flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Clinics" value={String(totalClinics)} icon={Building2} accent="primary" />
              <StatCard title="Total Users" value={String(totalUsers)} icon={Users} accent="info" />
              <StatCard title="Active Subscriptions" value={String(activeSubs)} icon={CreditCard} accent="success" />
              <StatCard title="Monthly Revenue" value={`EGP ${totalRevenue.toLocaleString()}`} icon={TrendingUp} accent="warning" />
            </div>

            {/* Recent clinics */}
            <div className="bg-card rounded-xl border">
              <div className="px-5 py-4 border-b flex items-center justify-between">
                <h3 className="font-semibold">Recent Clinics</h3>
                <Button variant="ghost" size="sm" onClick={() => setActiveTab("clinics")}>
                  View All <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr className="bg-muted/30">
                    <th>Clinic</th><th>Plan</th><th>Users</th><th>Created</th>
                  </tr></thead>
                  <tbody>
                    {tenants.slice(0, 5).map((t: any) => {
                      const sub = subscriptions.find((s: any) => s.tenant_id === t.id);
                      const userCount = profiles.filter((p: any) => p.tenant_id === t.id).length;
                      return (
                        <tr key={t.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => navigate(`/tenant/${t.slug}/dashboard`)}>
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">{t.name?.charAt(0)}</div>
                              <div>
                                <p className="font-medium">{t.name}</p>
                                <p className="text-xs text-muted-foreground">{t.slug}</p>
                              </div>
                            </div>
                          </td>
                          <td><StatusBadge variant={sub?.plan === "pro" ? "success" : sub?.plan === "enterprise" ? "info" : "default"}>{sub?.plan || "free"}</StatusBadge></td>
                          <td>{userCount}</td>
                          <td className="text-muted-foreground">{formatDate(t.created_at, locale, "date")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Subscription breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {["free", "pro", "enterprise"].map((plan) => {
                const count = subscriptions.filter((s: any) => s.plan === plan).length;
                const pct = subscriptions.length ? Math.round((count / subscriptions.length) * 100) : 0;
                return (
                  <div key={plan} className="bg-card rounded-xl border p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium capitalize">{plan} Plan</span>
                      <StatusBadge variant={plan === "pro" ? "success" : plan === "enterprise" ? "info" : "default"}>{count}</StatusBadge>
                    </div>
                    <div className="h-2 bg-muted rounded-full">
                      <div className="h-2 bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">{pct}% of total</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Clinics Tab */}
        {activeTab === "clinics" && (
          <div className="animate-fade-in">
            <DataTable
              columns={clinicColumns}
              data={filteredClinics}
              keyExtractor={(c) => c.id}
              searchable
              isLoading={loadingTenants}
              exportFileName="clinics"
              filterSlot={
                <StatusFilter
                  options={[
                    { value: "free", label: "Free" },
                    { value: "pro", label: "Pro" },
                    { value: "enterprise", label: "Enterprise" },
                  ]}
                  selected={clinicFilter}
                  onChange={setClinicFilter}
                />
              }
            />
          </div>
        )}

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="animate-fade-in">
            <DataTable
              columns={userColumns}
              data={profiles}
              keyExtractor={(p) => p.id}
              searchable
              isLoading={loadingProfiles}
              exportFileName="users"
            />
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === "subscriptions" && (
          <div className="animate-fade-in">
            <DataTable
              columns={subColumns}
              data={filteredSubs}
              keyExtractor={(s) => s.id}
              searchable
              isLoading={loadingSubs}
              exportFileName="subscriptions"
              filterSlot={
                <StatusFilter
                  options={[
                    { value: "free", label: "Free" },
                    { value: "pro", label: "Pro" },
                    { value: "enterprise", label: "Enterprise" },
                  ]}
                  selected={subFilter}
                  onChange={setSubFilter}
                />
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};
