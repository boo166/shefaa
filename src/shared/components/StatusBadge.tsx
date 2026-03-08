import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "destructive" | "info" | "default";

const variantClasses: Record<StatusVariant, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
  default: "bg-secondary text-secondary-foreground",
};

interface StatusBadgeProps {
  variant?: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

export const StatusBadge = ({ variant = "default", children, className }: StatusBadgeProps) => (
  <span className={cn("badge-status", variantClasses[variant], className)}>{children}</span>
);
