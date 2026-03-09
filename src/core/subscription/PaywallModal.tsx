import { useSubscription } from "./SubscriptionContext";
import { useAuth } from "@/core/auth/authStore";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const PaywallModal = () => {
  const { isExpired, plan, expiresAt, isLoading } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Don't show for super_admins or while loading
  if (isLoading || !isExpired || user?.role === "super_admin") return null;

  const formattedDate = expiresAt
    ? new Date(expiresAt).toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center space-y-6 border">
        <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">انتهت صلاحية اشتراكك</h2>
        <p className="text-muted-foreground">
          خطتك الحالية: <span className="font-semibold text-foreground capitalize">{plan}</span>
        </p>
        {formattedDate && (
          <p className="text-sm text-muted-foreground">
            تاريخ الانتهاء: {formattedDate}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          يرجى تجديد اشتراكك للاستمرار في استخدام النظام
        </p>
        <Button
          size="lg"
          className="w-full text-base"
          onClick={() => navigate("/pricing")}
        >
          تجديد الاشتراك
        </Button>
      </div>
    </div>
  );
};
