import { cn } from "@/lib/utils";

interface StatusFilterProps {
  options: { value: string; label: string }[];
  selected: string | null;
  onChange: (value: string | null) => void;
}

export const StatusFilter = ({ options, selected, onChange }: StatusFilterProps) => {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(null)}
        className={cn(
          "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted"
        )}
      >
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(selected === opt.value ? null : opt.value)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
            selected === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};
