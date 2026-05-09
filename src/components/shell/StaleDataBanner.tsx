import { cn } from "@/lib/utils";

/** Pass `show` from React Query `isStale` or custom staleness logic. */
export function StaleDataBanner({
  show,
  onRefresh,
  className,
}: {
  show: boolean;
  onRefresh?: () => void;
  className?: string;
}) {
  if (!show) return null;

  return (
    <div
      className={cn(
        "flex w-full flex-wrap items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-950 dark:text-amber-50",
        className,
      )}
      role="status"
    >
      <span>Displayed data may be stale.</span>
      {onRefresh && (
        <button type="button" className="underline underline-offset-2" onClick={onRefresh}>
          Refresh
        </button>
      )}
    </div>
  );
}
