import { useState, useRef, useEffect, useCallback } from "react";
import { Bell, CalendarDays, FlaskConical, DollarSign, AlertTriangle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/shared/utils/formatDate";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

const DEMO_NOTIFICATIONS: Notification[] = [
  { id: "1", type: "appointment", title: "Upcoming Appointment", body: "Mohammed Al-Rashid at 2:00 PM with Dr. Sarah Ahmed", created_at: new Date().toISOString(), read: false },
  { id: "2", type: "lab", title: "Lab Results Ready", body: "CBC results for Fatima Hassan are now available", created_at: new Date(Date.now() - 900000).toISOString(), read: false },
  { id: "3", type: "billing", title: "Payment Received", body: "INV-005 payment of $480 confirmed", created_at: new Date(Date.now() - 3600000).toISOString(), read: true },
  { id: "4", type: "alert", title: "Low Stock Alert", body: "Amoxicillin 500mg is running low (25 remaining)", created_at: new Date(Date.now() - 7200000).toISOString(), read: false },
];

const typeIcon: Record<string, typeof Bell> = {
  appointment: CalendarDays,
  lab: FlaskConical,
  billing: DollarSign,
  alert: AlertTriangle,
  info: Info,
};

const typeColor: Record<string, string> = {
  appointment: "text-primary",
  lab: "text-green-600",
  billing: "text-yellow-600",
  alert: "text-destructive",
  info: "text-muted-foreground",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const NotificationCenter = () => {
  const { t, locale, calendarType } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    if (isDemo || !user?.id) {
      setNotifications(DEMO_NOTIFICATIONS);
      return;
    }

    const { data } = await supabase
      .from("notifications" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    setNotifications((data as any[]) ?? []);
  }, [user?.id, isDemo]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (isDemo || !user?.id) return;

    const channel = supabase
      .channel("user-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isDemo]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    if (isDemo) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      return;
    }
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    await supabase
      .from("notifications" as any)
      .update({ read: true })
      .in("id", unreadIds);

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const dismiss = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!isDemo) {
      await supabase.from("notifications" as any).update({ read: true }).eq("id", id);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="p-2 rounded-md hover:bg-muted relative">
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute top-1 end-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-2 w-80 sm:w-96 bg-card rounded-lg border shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">{t("common.notifications")}</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                {t("common.markAllRead") ?? "Mark all read"}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">{t("common.noData")}</div>
            ) : (
              notifications.map((n) => {
                const Icon = typeIcon[n.type] ?? Info;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-colors",
                      !n.read && "bg-primary/5",
                    )}
                  >
                    <div className={cn("mt-0.5 shrink-0", typeColor[n.type] ?? "text-muted-foreground")}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm", !n.read && "font-medium")}>{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                      <p className="text-xs text-muted-foreground/60 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    <button onClick={() => dismiss(n.id)} className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
