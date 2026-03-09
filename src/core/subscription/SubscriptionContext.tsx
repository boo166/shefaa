import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<SubscriptionState>(defaultState);

  useEffect(() => {
    if (!isAuthenticated || !user?.tenantId) {
      setState({ ...defaultState, isLoading: false });
      return;
    }

    const fetchSubscription = async () => {
      setState((s) => ({ ...s, isLoading: true }));
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("tenant_id", user.tenantId)
        .single();

      if (error || !data) {
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
    };

    fetchSubscription();
  }, [isAuthenticated, user?.tenantId]);

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  );
};
