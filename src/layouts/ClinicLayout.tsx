import { NavLink, Outlet, useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/core/auth/authStore";
import { useI18n } from "@/core/i18n/i18nStore";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import {
  LayoutDashboard, Users, CalendarDays, Stethoscope,
  Receipt, Pill, FlaskConical, Shield, BarChart3,
  Settings, Bell, LogOut, Menu, X, Search,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "dashboard", icon: LayoutDashboard, labelKey: "common.dashboard", permission: "view_dashboard" },
  { path: "patients", icon: Users, labelKey: "common.patients", permission: "view_patients" },
  { path: "appointments", icon: CalendarDays, labelKey: "common.appointments", permission: "view_appointments" },
  { path: "doctors", icon: Stethoscope, labelKey: "common.doctors", permission: "view_dashboard" },
  { path: "billing", icon: Receipt, labelKey: "common.billing", permission: "view_billing" },
  { path: "pharmacy", icon: Pill, labelKey: "common.pharmacy", permission: "manage_pharmacy" },
  { path: "laboratory", icon: FlaskConical, labelKey: "common.laboratory", permission: "manage_laboratory" },
  { path: "insurance", icon: Shield, labelKey: "common.insurance", permission: "view_billing" },
  { path: "reports", icon: BarChart3, labelKey: "common.reports", permission: "view_reports" },
  { path: "settings", icon: Settings, labelKey: "common.settings", permission: "manage_clinic" },
] as const;

export const ClinicLayout = () => {
  const { clinicSlug } = useParams();
  const { user, logout, hasPermission } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const visibleNav = navItems.filter((item) => hasPermission(item.permission as any));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full rtl:lg:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold text-sm">
            M
          </div>
          <div>
            <h1 className="font-semibold text-sm text-sidebar-primary-foreground">{t("common.appName")}</h1>
            <p className="text-xs text-sidebar-foreground/60 truncate max-w-[150px]">{user?.tenantName}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={`/tenant/${clinicSlug}/${item.path}`}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn("sidebar-item", isActive && "active")}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{t(item.labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-medium">
              {user?.name?.charAt(0) ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">{user?.role?.replace("_", " ")}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-1.5 rounded-md hover:bg-muted">
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="hidden sm:flex items-center gap-2 bg-muted rounded-md px-3 py-1.5">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("common.search")}
                className="bg-transparent text-sm outline-none w-48 placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button className="p-2 rounded-md hover:bg-muted relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="absolute top-1 end-1 h-2 w-2 rounded-full bg-destructive" />
            </button>
            <button onClick={handleLogout} className="p-2 rounded-md hover:bg-muted text-muted-foreground" title={t("common.logout")}>
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
