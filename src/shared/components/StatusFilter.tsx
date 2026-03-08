import { cn } from "@/lib/utils";

interface StatusFilterProps {
  options: { value: string; label: string }[];
  selected: string | null;
  onChange: (value: string | null) => void;
}

export const StatusFilter = ({ options, selected, onChange }: StatusFilterProps) => {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => onChange(null)}
        className={cn(
          "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border",
          selected === null
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card text-muted-foreground border-border hover:bg-muted"
        )}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(selected === opt.value ? null : opt.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-colors border capitalize",
            selected === opt.value
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-muted-foreground border-border hover:bg-muted"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
