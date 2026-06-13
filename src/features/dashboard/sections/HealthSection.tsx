import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatCard } from "@/shared/components/StatCard";

type HealthSectionProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
};

export function HealthSection({ title, description, children, className }: HealthSectionProps) {
  return (
    <section className={cn("rounded-xl border bg-card p-5 space-y-4", className)}>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3">
        {children}
      </div>
    </section>
  );
}

type HealthStatProps = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  accent?: "primary" | "success" | "warning" | "destructive" | "info";
  subtitle?: string;
};

export function HealthStat({ title, value, icon, accent = "primary", subtitle }: HealthStatProps) {
  return (
    <StatCard
      title={title}
      value={value}
      icon={icon}
      accent={accent}
      subtitle={subtitle}
      className="shadow-none border bg-background/60"
    />
  );
}
