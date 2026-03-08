import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: { value: number; positive: boolean };
  className?: string;
}

export const StatCard = ({ title, value, icon: Icon, trend, className }: StatCardProps) => (
  <div className={cn("stat-card animate-fade-in", className)}>
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm text-muted-foreground">{title}</span>
      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </div>
    <div className="text-2xl font-bold">{value}</div>
    {trend && (
      <p className={cn("text-xs mt-1", trend.positive ? "text-success" : "text-destructive")}>
        {trend.positive ? "+" : ""}{trend.value}% from last month
      </p>
    )}
  </div>
);
