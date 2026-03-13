import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  className?: string;
  accent?: "primary" | "success" | "warning" | "destructive" | "info";
  subtitle?: string;
}

const accentMap = {
  primary: {
    icon: "text-primary bg-primary/10",
    trend: "text-primary",
  },
  success: {
    icon: "text-success bg-success/10",
    trend: "text-success",
  },
  warning: {
    icon: "text-warning bg-warning/10",
    trend: "text-warning",
  },
  destructive: {
    icon: "text-destructive bg-destructive/10",
    trend: "text-destructive",
  },
  info: {
    icon: "text-info bg-info/10",
    trend: "text-info",
  },
};

export const StatCard = ({
  title,
  value,
  icon: Icon,
  trend,
  className,
  accent = "primary",
  subtitle,
}: StatCardProps) => {
  const colors = accentMap[accent];

  return (
    <div className={cn("stat-card", className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", colors.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {trend && (
        <div className="flex items-center gap-1.5 mt-2">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
              trend.positive
                ? "text-success bg-success/10"
                : "text-destructive bg-destructive/10"
            )}
          >
            {trend.positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {trend.positive ? "+" : ""}
            {trend.value}%
          </span>
          <span className="text-2xs text-muted-foreground">vs last month</span>
        </div>
      )}
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>
      )}
    </div>
  );
};
