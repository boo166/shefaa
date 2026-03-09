import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  className?: string;
  accent?: "primary" | "success" | "warning" | "destructive" | "info";
}

const accentStyles = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export const StatCard = ({ title, value, icon: Icon, trend, className, accent = "primary" }: StatCardProps) => (
  <div className={cn("stat-card group hover:shadow-md transition-all duration-200", className)}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</span>
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", accentStyles[accent])}>
        <Icon className="h-5 w-5" />
      </div>
    </div>
    <div className="text-2xl font-bold tracking-tight">{value}</div>
    {trend && (
      <div className={cn("flex items-center gap-1 mt-2 text-xs font-medium", trend.positive ? "text-success" : "text-destructive")}>
        {trend.positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
        <span>{trend.positive ? "+" : ""}{trend.value}%</span>
        <span className="text-muted-foreground font-normal ml-1">vs last month</span>
      </div>
    )}
  </div>
);
