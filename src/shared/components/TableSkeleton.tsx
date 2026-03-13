import { cn } from "@/lib/utils";

interface TableSkeletonProps {
  columns?: number;
  rows?: number;
}

export const TableSkeleton = ({ columns = 5, rows = 6 }: TableSkeletonProps) => (
  <div className="space-y-0">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className={cn("flex items-center gap-4 px-4 py-3.5", i < rows - 1 && "border-b border-border/50")}
      >
        {Array.from({ length: columns }).map((_, j) => (
          <div
            key={j}
            className={cn(
              "skeleton-line",
              j === 0 ? "w-24" : j === 1 ? "w-36" : "w-20",
              "flex-shrink-0"
            )}
          />
        ))}
      </div>
    ))}
  </div>
);
