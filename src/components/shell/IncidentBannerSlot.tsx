import { cn } from "@/lib/utils";

/** Ops-controlled incident banner via `VITE_INCIDENT_BANNER` (optional). */
export function IncidentBannerSlot({ className }: { className?: string }) {
  const text = import.meta.env.VITE_INCIDENT_BANNER as string | undefined;
  if (!text?.trim()) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex w-full items-center justify-center border-b border-destructive/40 bg-destructive/15 px-3 py-2 text-center text-xs font-medium text-destructive",
        className,
      )}
      data-testid="incident-banner"
    >
      {text}
    </div>
  );
}
