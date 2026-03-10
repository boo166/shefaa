import { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/authStore";

export type PlanType = "free" | "starter" | "pro" | "enterprise";

interface SubscriptionState {
  plan: PlanType;
  status: string;
  isExpired: boolean;
  daysRemaining: number;
  isTrialing: boolean;
  expiresAt: string | null;
  isLoading: boolean;
}

const defaultState: SubscriptionState = {
  plan: "free",
  status: "active",
  isExpired: false,
  daysRemaining: 0,
  isTrialing: false,
  expiresAt: null,
  isLoading: true,
};

const SubscriptionContext = createContext<SubscriptionState>(defaultState);

export const useSubscription = () => useContext(SubscriptionContext);

export const SubscriptionProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>(defaultState);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Wait for auth to finish loading before doing anything
    if (authLoading) return;

    if (!isAuthenticated || !user?.tenantId) {
      setState({ ...defaultState, isLoading: false });
      return;
    }

    // Super admins don't need subscription checks
    if (user.role === "super_admin") {
      setState({
        plan: "enterprise",
        status: "active",
        isExpired: false,
        daysRemaining: 999,
        isTrialing: false,
        expiresAt: null,
        isLoading: false,
      });
      return;
    }

    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const fetchSubscription = async () => {
      setState((s) => ({ ...s, isLoading: true }));

      try {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("tenant_id", user.tenantId)
          .single();

        if (controller.signal.aborted) return;

        if (error) {
          console.warn("Subscription fetch error:", error.message);
          setState({ ...defaultState, isLoading: false });
          return;
        }

        if (!data) {
          setState({ ...defaultState, isLoading: false });
          return;
        }

        const now = new Date();
        const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
        const isExpired = data.status !== "active" || (expiresAt ? expiresAt < now : false);
        const daysRemaining = expiresAt
          ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;
        const isTrialing = data.status === "trialing";

        setState({
          plan: (data.plan as PlanType) || "free",
          status: data.status,
          isExpired,
          daysRemaining,
          isTrialing,
          expiresAt: data.expires_at,
          isLoading: false,
        });
      } catch (err: any) {
        if (err?.name === "AbortError" || controller.signal.aborted) return;
        console.warn("Subscription fetch failed:", err?.message);
        setState({ ...defaultState, isLoading: false });
      }
    };

    fetchSubscription();

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, user?.tenantId, user?.role, authLoading]);

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  );
};
