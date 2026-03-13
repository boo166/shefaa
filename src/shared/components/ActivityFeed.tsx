import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface ActivityItem {
  id: string;
  icon: LucideIcon;
  iconColor?: string;
  title: string;
  description?: string;
  time: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  title?: string;
  emptyMessage?: string;
}

export const ActivityFeed = ({ items, title, emptyMessage = "No recent activity" }: ActivityFeedProps) => (
  <div className="bg-card rounded-xl border">
    {title && (
      <div className="px-5 py-3.5 border-b">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
    )}
    <div className="divide-y divide-border/50">
      {items.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">{emptyMessage}</div>
      ) : (
        items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="flex items-start gap-3 px-5 py-3">
              <div className={cn("mt-0.5 h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0", item.iconColor || "bg-primary/10 text-primary")}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{item.title}</p>
                {item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>}
              </div>
              <span className="text-2xs text-muted-foreground flex-shrink-0 mt-0.5">{item.time}</span>
            </div>
          );
        })
      )}
    </div>
  </div>
);
