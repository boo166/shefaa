import { useSubscription } from "@/core/subscription/SubscriptionContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown, Calendar, CreditCard, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

const planLabels: Record<string, string> = {
  free: "مجانية",
  starter: "المبتدئ",
  pro: "الاحترافية",
  enterprise: "المؤسسات",
};

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "نشط", variant: "default" },
  trialing: { label: "فترة تجريبية", variant: "secondary" },
  expired: { label: "منتهي", variant: "destructive" },
  canceled: { label: "ملغي", variant: "outline" },
};

export const SubscriptionTab = () => {
  const { plan, status, isExpired, daysRemaining, isTrialing, expiresAt, isLoading } = useSubscription();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusInfo = statusLabels[status] || statusLabels.active;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-lg font-semibold">إدارة الاشتراك</h2>
        <p className="text-sm text-muted-foreground">عرض وإدارة تفاصيل خطتك الحالية</p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-5 w-5 text-primary" />
              الخطة الحالية
            </CardTitle>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <div>
              <p className="text-2xl font-bold text-foreground">خطة {planLabels[plan] || plan}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {plan === "free" ? "0 جنيه/شهر" : plan === "starter" ? "299 جنيه/شهر" : plan === "pro" ? "799 جنيه/شهر" : "تواصل معنا"}
              </p>
            </div>
            {plan !== "enterprise" && (
              <Button onClick={() => navigate("/pricing")} size="sm">
                ترقية الخطة
              </Button>
            )}
          </div>

          {/* Details */}
          <div className="grid gap-3">
            {expiresAt && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">تاريخ الانتهاء:</span>
                <span className="font-medium">{format(new Date(expiresAt), "dd MMMM yyyy", { locale: ar })}</span>
              </div>
            )}

            {daysRemaining > 0 && !isExpired && (
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">الأيام المتبقية:</span>
                <span className="font-medium">{daysRemaining} يوم</span>
              </div>
            )}

            {isTrialing && (
              <div className="flex items-center gap-3 text-sm">
                <CreditCard className="h-4 w-4 text-blue-500" />
                <span className="text-blue-600 font-medium">أنت في فترة تجريبية</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Warning if expired */}
      {isExpired && (
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">اشتراكك منتهي</p>
              <p className="text-sm text-muted-foreground mt-1">
                يرجى تجديد اشتراكك للاستمرار في استخدام جميع الميزات.
              </p>
              <Button onClick={() => navigate("/pricing")} variant="destructive" size="sm" className="mt-3">
                تجديد الآن
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={() => navigate("/pricing")}>
          عرض جميع الخطط
        </Button>
      </div>
    </div>
  );
};
