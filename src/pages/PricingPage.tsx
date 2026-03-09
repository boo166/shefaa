import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscription, PlanType } from "@/core/subscription/SubscriptionContext";
import { useAuth } from "@/core/auth/authStore";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanInfo {
  id: PlanType;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  popular?: boolean;
  doctorLimit: string;
}

const plans: PlanInfo[] = [
  {
    id: "free",
    name: "مجاني",
    monthlyPrice: 0,
    annualPrice: 0,
    doctorLimit: "طبيب واحد",
    features: ["إدارة المواعيد الأساسية", "طبيب واحد فقط", "إدارة المرضى", "لوحة تحكم بسيطة"],
  },
  {
    id: "starter",
    name: "المبتدئ",
    monthlyPrice: 299,
    annualPrice: 2490,
    doctorLimit: "حتى 3 أطباء",
    features: ["جميع مميزات المجاني", "حتى 3 أطباء", "الفواتير والمحاسبة", "التقارير والإحصائيات", "دعم فني عبر البريد"],
  },
  {
    id: "pro",
    name: "الاحترافي",
    monthlyPrice: 799,
    annualPrice: 6650,
    doctorLimit: "أطباء غير محدودين",
    popular: true,
    features: [
      "جميع مميزات المبتدئ",
      "أطباء غير محدودين",
      "تذكيرات SMS",
      "تحليلات متقدمة",
      "المختبر والصيدلية",
      "دعم فني أولوية",
    ],
  },
  {
    id: "enterprise",
    name: "المؤسسات",
    monthlyPrice: 0,
    annualPrice: 0,
    doctorLimit: "غير محدود",
    features: [
      "جميع مميزات الاحترافي",
      "التأمين الصحي",
      "تكامل API",
      "مدير حساب مخصص",
      "تدريب الفريق",
      "SLA مخصص",
    ],
  },
];

const faqs = [
  { q: "هل يمكنني الإلغاء في أي وقت؟", a: "نعم، يمكنك إلغاء اشتراكك في أي وقت. ستستمر في الوصول حتى نهاية فترة الفوترة الحالية." },
  { q: "هل بياناتي آمنة؟", a: "نعم، نستخدم أعلى معايير الأمان وتشفير البيانات لحماية معلوماتك الطبية." },
  { q: "هل تقدمون فترة تجريبية مجانية؟", a: "نعم، يمكنك البدء بالخطة المجانية واستكشاف النظام قبل الترقية لخطة مدفوعة." },
];

export const PricingPage = () => {
  const [annual, setAnnual] = useState(false);
  const { plan: currentPlan } = useSubscription();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="text-center py-16 px-4">
        <h1 className="text-4xl font-bold text-foreground mb-4">اختر الخطة المناسبة لعيادتك</h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          ابدأ مجاناً وقم بالترقية عندما تحتاج إلى مميزات أكثر
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-3 bg-muted rounded-full p-1">
          <button
            onClick={() => setAnnual(false)}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-medium transition-colors",
              !annual ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            )}
          >
            شهري
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={cn(
              "px-5 py-2 rounded-full text-sm font-medium transition-colors",
              annual ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
            )}
          >
            سنوي
            <Badge variant="secondary" className="mr-2 text-xs">شهرين مجاناً</Badge>
          </button>
        </div>
      </div>

      {/* Plans grid */}
      <div className="max-w-6xl mx-auto px-4 pb-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => {
          const isCurrent = isAuthenticated && currentPlan === plan.id;
          const price = plan.id === "enterprise" ? null : annual ? plan.annualPrice : plan.monthlyPrice;
          const isEnterprise = plan.id === "enterprise";

          return (
            <Card
              key={plan.id}
              className={cn(
                "relative flex flex-col",
                plan.popular && "border-primary shadow-lg ring-2 ring-primary/20"
              )}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground px-3">الأكثر شعبية</Badge>
                </div>
              )}
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{plan.doctorLimit}</p>
                {price !== null ? (
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground">{price}</span>
                    <span className="text-muted-foreground text-sm mr-1">
                      جنيه/{annual ? "سنة" : "شهر"}
                    </span>
                  </div>
                ) : (
                  <div className="mt-4">
                    <span className="text-2xl font-bold text-foreground">تواصل معنا</span>
                  </div>
                )}
              </CardHeader>

              <CardContent className="flex-1 pt-4">
                <ul className="space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="pt-4">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    خطتك الحالية
                  </Button>
                ) : isEnterprise ? (
                  <Button variant="outline" className="w-full">
                    تواصل معنا
                    <ArrowRight className="h-4 w-4 mr-2" />
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => {
                      if (!isAuthenticated) {
                        navigate("/login");
                        return;
                      }
                      window.location.href = `mailto:sales@medflow.app?subject=${encodeURIComponent(`Plan upgrade request: ${plan.name}`)}`;
                    }}
                  >
                    اشترك الآن
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-4 pb-20">
        <h2 className="text-2xl font-bold text-center mb-8 text-foreground">الأسئلة الشائعة</h2>
        <div className="space-y-4">
          {faqs.map((faq) => (
            <Card key={faq.q}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{faq.q}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{faq.a}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
