import { useSubscription, PlanType } from "./SubscriptionContext";

type Feature =
  | "appointments"
  | "billing"
  | "reports"
  | "sms_reminders"
  | "multi_doctor"
  | "analytics"
  | "laboratory"
  | "pharmacy"
  | "insurance";

const PLAN_FEATURES: Record<PlanType, Feature[]> = {
  free: ["appointments"],
  starter: ["appointments", "billing", "reports"],
  pro: ["appointments", "billing", "reports", "sms_reminders", "multi_doctor", "analytics", "laboratory", "pharmacy"],
  enterprise: ["appointments", "billing", "reports", "sms_reminders", "multi_doctor", "analytics", "laboratory", "pharmacy", "insurance"],
};

const PLAN_HIERARCHY: PlanType[] = ["free", "starter", "pro", "enterprise"];

export function useFeatureAccess() {
  const { plan } = useSubscription();

  const hasFeature = (feature: Feature): boolean => {
    return PLAN_FEATURES[plan]?.includes(feature) ?? false;
  };

  const requiredPlan = (feature: Feature): PlanType | null => {
    for (const p of PLAN_HIERARCHY) {
      if (PLAN_FEATURES[p]?.includes(feature)) return p;
    }
    return null;
  };

  return { hasFeature, requiredPlan, currentPlan: plan };
}
