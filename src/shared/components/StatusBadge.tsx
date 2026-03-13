import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "destructive" | "info" | "default";

const variantClasses: Record<StatusVariant, string> = {
  success: "bg-success/10 text-success ring-success/20",
  warning: "bg-warning/10 text-warning ring-warning/20",
  destructive: "bg-destructive/10 text-destructive ring-destructive/20",
  info: "bg-info/10 text-info ring-info/20",
  default: "bg-muted text-muted-foreground ring-border",
};

interface StatusBadgeProps {
  variant?: StatusVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export const StatusBadge = ({ variant = "default", children, className, dot }: StatusBadgeProps) => (
  <span className={cn("badge-status", variantClasses[variant], className)}>
    {dot && (
      <span
        className={cn("mr-1.5 h-1.5 w-1.5 rounded-full", {
          "bg-success": variant === "success",
          "bg-warning": variant === "warning",
          "bg-destructive": variant === "destructive",
          "bg-info": variant === "info",
          "bg-muted-foreground": variant === "default",
        })}
      />
    )}
    {children}
  </span>
);
