import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/core/i18n/i18nStore";
import { StatCard } from "@/shared/components/StatCard";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { Users, CalendarDays, Stethoscope, DollarSign, TrendingUp, XCircle } from "lucide-react";
import { useAuth } from "@/core/auth/authStore";
import { formatCurrency } from "@/shared/utils/formatDate";
import { reportService } from "@/services";
import { queryKeys } from "@/services/queryKeys";
import { useChartColors } from "@/shared/hooks/useChartColors";
import { PageContainer, SectionHeader } from "@/components/layout/AppLayout";
import { OperationsCenter } from "./OperationsCenter";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const statusVariant: Record<string, "success" | "info" | "default" | "destructive" | "warning"> = {
  completed: "success",
  in_progress: "info",
  scheduled: "default",
  cancelled: "destructive",
  no_show: "warning",
};

export const DashboardPage = () => {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const tenantId = user?.tenantId;
  const colors = useChartColors();
  const chartPalette = [colors.primary, colors.success, colors.warning, colors.info, colors.violet];

  const { data: overview } = useQuery({
    queryKey: queryKeys.reports.overview(tenantId),
    queryFn: () => reportService.getOverview(),
    enabled: !!tenantId,
  });

  const { data: revenueTrend = [] } = useQuery({
    queryKey: queryKeys.reports.revenueByMonth(tenantId),
    queryFn: () => reportService.getRevenueByMonth(6),
    enabled: !!tenantId,
  });

  const { data: apptTypes = [] } = useQuery({
    queryKey: queryKeys.reports.appointmentTypes(tenantId),
    queryFn: () => reportService.getAppointmentTypes(),
    enabled: !!tenantId,
  });

  const { data: statusCounts = { scheduled: 0, in_progress: 0, completed: 0, cancelled: 0, no_show: 0 } } = useQuery({
    queryKey: queryKeys.reports.appointmentStatuses(tenantId),
    queryFn: () => reportService.getAppointmentStatusCounts(),
    enabled: !!tenantId,
  });

  const totalPatients = overview?.total_patients ?? 0;
  const totalAppointments = overview?.total_appointments ?? 0;
  const averageRating = overview?.avg_doctor_rating ?? 0;
  const totalRevenue = overview?.total_revenue ?? 0;

  const statusRows = useMemo(
    () => ([
      { status: "scheduled", label: t("appointments.scheduled"), count: statusCounts.scheduled },
      { status: "in_progress", label: t("appointments.inProgress"), count: statusCounts.in_progress },
      { status: "completed", label: t("appointments.completed"), count: statusCounts.completed },
      { status: "cancelled", label: t("appointments.cancelled"), count: statusCounts.cancelled },
      { status: "no_show", label: t("dashboard.ops.clinicHealth.noShowRate"), count: statusCounts.no_show },
    ]),
    [statusCounts, t],
  );

  const totalStatusCount = statusRows.reduce((sum, r) => sum + r.count, 0);
  const noShowRate = totalStatusCount > 0 ? (statusCounts.no_show / totalStatusCount) * 100 : 0;

  return (
    <PageContainer className="space-y-6">
      <SectionHeader
        title={t("dashboard.ops.title")}
        subtitle={`${t("dashboard.welcomeBack") || "Welcome back"}, ${user?.name?.split(" ")[0] ?? ""}`}
      />

      <OperationsCenter />

      <SectionHeader
        title={t("dashboard.ops.analyticsTitle")}
        subtitle={t("dashboard.ops.analyticsSubtitle")}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard title={t("dashboard.totalPatients")} value={totalPatients} icon={Users} accent="primary" />
        <StatCard title={t("reports.totalAppointments")} value={String(totalAppointments)} icon={CalendarDays} accent="info" />
        <StatCard title={t("reports.avgDoctorRating")} value={averageRating ? Number(averageRating).toFixed(1) : "0.0"} icon={Stethoscope} accent="success" />
        <StatCard title={t("dashboard.periodRevenue")} value={formatCurrency(Number(totalRevenue), locale)} icon={DollarSign} accent="warning" />
        <StatCard
          title={t("dashboard.ops.clinicHealth.noShowRate")}
          value={String(statusCounts.no_show)}
          icon={XCircle}
          accent="warning"
          subtitle={`${noShowRate.toFixed(1)}%`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border p-5">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-semibold">{t("reports.revenue") || "Revenue"}</h3>
              <p className="text-xs text-muted-foreground">{t("reports.trend") || "Last 6 months"}</p>
            </div>
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={revenueTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.primary} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={colors.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.border} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: colors.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: colors.muted }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: colors.fg,
                  boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                }}
                formatter={(v: number) => [`$${Number(v).toLocaleString()}`, "Revenue"]}
              />
              <Area type="monotone" dataKey="revenue" stroke={colors.primary} fill="url(#revGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: colors.primary }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card rounded-xl border p-5">
          <h3 className="text-sm font-semibold mb-1">{t("reports.byType") || "By Type"}</h3>
          <p className="text-xs text-muted-foreground mb-2">{t("dashboard.ops.appointmentDistribution")}</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={apptTypes} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={2} strokeWidth={0}>
                {apptTypes.map((_, i) => <Cell key={i} fill={chartPalette[i % chartPalette.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.card,
                  border: `1px solid ${colors.border}`,
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: colors.fg,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
            {apptTypes.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: chartPalette[i % chartPalette.length] }} />
                <span className="text-muted-foreground">{item.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold">{t("reports.appointmentStatusDistribution")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{String(totalAppointments)} total</p>
          </div>
        </div>
        <div className="space-y-3">
          {statusRows.map((row) => (
            <div key={row.status} className="flex items-center gap-3">
              <StatusBadge variant={statusVariant[row.status] ?? "default"} dot>{row.label}</StatusBadge>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: totalStatusCount > 0 ? `${(row.count / totalStatusCount) * 100}%` : "0%",
                    backgroundColor: row.status === "completed" ? colors.success
                      : row.status === "in_progress" ? colors.info
                      : row.status === "no_show" ? colors.warning
                      : row.status === "cancelled" ? colors.destructive
                      : colors.border,
                  }}
                />
              </div>
              <span className="text-sm font-medium tabular-nums w-8 text-right">{row.count}</span>
            </div>
          ))}
          {statusRows.every((r) => r.count === 0) && (
            <div className="text-sm text-muted-foreground text-center py-4">{t("common.noData")}</div>
          )}
        </div>
      </div>
    </PageContainer>
  );
};
