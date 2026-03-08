import { useNavigate } from "react-router-dom";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/core/i18n/i18nStore";
import {
  ArrowLeft,
  UserPlus,
  LogIn,
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  Receipt,
  Pill,
  FlaskConical,
  Shield,
  BarChart3,
  Settings,
  Bell,
  Download,
  Globe,
  ShieldCheck,
  ChevronRight,
  CheckCircle2,
  Play,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const TutorialPage = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [expandedStep, setExpandedStep] = useState<number | null>(0);
  const [selectedVideo, setSelectedVideo] = useState<{ title: string; url: string; description: string } | null>(null);

  const mockVideoUrl = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1"; // Placeholder demo video


  const gettingStartedSteps = [
    {
      icon: UserPlus,
      title: t("tutorial.step1Title"),
      description: t("tutorial.step1Desc"),
      details: [
        t("tutorial.step1Detail1"),
        t("tutorial.step1Detail2"),
        t("tutorial.step1Detail3"),
        t("tutorial.step1Detail4"),
      ],
      color: "hsl(var(--primary))",
    },
    {
      icon: LogIn,
      title: t("tutorial.step2Title"),
      description: t("tutorial.step2Desc"),
      details: [
        t("tutorial.step2Detail1"),
        t("tutorial.step2Detail2"),
        t("tutorial.step2Detail3"),
        t("tutorial.step2Detail4"),
      ],
      color: "hsl(var(--info))",
    },
    {
      icon: Users,
      title: t("tutorial.step3Title"),
      description: t("tutorial.step3Desc"),
      details: [
        t("tutorial.step3Detail1"),
        t("tutorial.step3Detail2"),
        t("tutorial.step3Detail3"),
        t("tutorial.step3Detail4"),
      ],
      color: "hsl(var(--success))",
    },
    {
      icon: LayoutDashboard,
      title: t("tutorial.step4Title"),
      description: t("tutorial.step4Desc"),
      details: [
        t("tutorial.step4Detail1"),
        t("tutorial.step4Detail2"),
        t("tutorial.step4Detail3"),
        t("tutorial.step4Detail4"),
      ],
      color: "hsl(var(--warning))",
    },
  ];

  const features = [
    { icon: LayoutDashboard, title: t("common.dashboard"), description: t("tutorial.dashboardDesc"), forRoles: [t("tutorial.allRoles")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: Users, title: t("common.patients"), description: t("tutorial.patientsDesc"), forRoles: [t("tutorial.admin"), t("tutorial.doctor"), t("tutorial.receptionist"), t("tutorial.nurse")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: CalendarDays, title: t("common.appointments"), description: t("tutorial.appointmentsDesc"), forRoles: [t("tutorial.admin"), t("tutorial.doctor"), t("tutorial.receptionist"), t("tutorial.nurse")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: Stethoscope, title: t("common.doctors"), description: t("tutorial.doctorsDesc"), forRoles: [t("tutorial.admin"), t("tutorial.doctor"), t("tutorial.receptionist"), t("tutorial.nurse")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: Receipt, title: t("common.billing"), description: t("tutorial.billingDesc"), forRoles: [t("tutorial.admin"), t("tutorial.accountant")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: Pill, title: t("common.pharmacy"), description: t("tutorial.pharmacyDesc"), forRoles: [t("tutorial.admin")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: FlaskConical, title: t("common.laboratory"), description: t("tutorial.laboratoryDesc"), forRoles: [t("tutorial.admin")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: Shield, title: t("common.insurance"), description: t("tutorial.insuranceDesc"), forRoles: [t("tutorial.admin"), t("tutorial.accountant")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: BarChart3, title: t("common.reports"), description: t("tutorial.reportsDesc"), forRoles: [t("tutorial.admin"), t("tutorial.accountant")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
    { icon: Settings, title: t("common.settings"), description: t("tutorial.settingsDesc"), forRoles: [t("tutorial.admin")], demoUrl: mockVideoUrl, thumbnail: "/placeholder.svg" },
  ];

  const tips = [
    { icon: Bell, title: t("tutorial.notifications"), text: t("tutorial.tipNotifications") },
    { icon: Download, title: t("tutorial.exportData"), text: t("tutorial.tipExport") },
    { icon: Globe, title: t("tutorial.language"), text: t("tutorial.tipLanguage") },
    { icon: ShieldCheck, title: t("tutorial.security"), text: t("tutorial.tipSecurity") },
  ];

  const permissionsTable = [
    { page: t("common.dashboard"), perms: [true, true, true, true, true] },
    { page: t("common.patients"), perms: [true, true, true, true, false] },
    { page: t("common.appointments"), perms: [true, true, true, true, false] },
    { page: t("common.doctors"), perms: [true, true, true, true, true] },
    { page: t("common.billing"), perms: [true, false, false, false, true] },
    { page: t("common.pharmacy"), perms: [true, false, false, false, false] },
    { page: t("common.laboratory"), perms: [true, false, false, false, false] },
    { page: t("common.insurance"), perms: [true, false, false, false, true] },
    { page: t("common.reports"), perms: [true, false, false, false, true] },
    { page: t("common.settings"), perms: [true, false, false, false, false] },
  ];

  const roleColors: Record<string, string> = {
    [t("tutorial.admin")]: "bg-primary/10 text-primary",
    [t("tutorial.doctor")]: "bg-info/10 text-info",
    [t("tutorial.receptionist")]: "bg-success/10 text-success",
    [t("tutorial.nurse")]: "bg-warning/10 text-warning",
    [t("tutorial.accountant")]: "bg-destructive/10 text-destructive",
    [t("tutorial.allRoles")]: "bg-muted text-muted-foreground",
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-14">
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("tutorial.backToLogin")}
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
            <Play className="h-3.5 w-3.5" />
            {t("tutorial.gettingStartedGuide")}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            {t("tutorial.welcomeTo")} <span className="text-primary">MedFlow</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t("tutorial.heroDescription")}
          </p>
        </div>

        {/* Getting Started Steps */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">1</span>
            {t("tutorial.gettingStarted")}
          </h2>
          <div className="grid gap-3">
            {gettingStartedSteps.map((step, idx) => (
              <div
                key={idx}
                className={cn(
                  "bg-card rounded-xl border transition-all duration-200 overflow-hidden cursor-pointer",
                  expandedStep === idx ? "ring-2 ring-primary/20 shadow-md" : "hover:shadow-sm"
                )}
                onClick={() => setExpandedStep(expandedStep === idx ? null : idx)}
              >
                <div className="flex items-center gap-4 p-4">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${step.color}15`, color: step.color }}
                  >
                    <step.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-5 w-5 text-muted-foreground shrink-0 transition-transform duration-200",
                      expandedStep === idx && "rotate-90"
                    )}
                  />
                </div>
                {expandedStep === idx && (
                  <div className="px-4 pb-4 pt-0">
                    <div className="ms-14 space-y-2.5 border-s-2 border-primary/20 ps-4">
                      {step.details.map((detail, dIdx) => (
                        <div key={dIdx} className="flex items-start gap-2.5">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span className="text-sm text-foreground/80">{detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Features Overview */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">2</span>
            {t("tutorial.featuresOverview")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((feature, idx) => (
              <div key={idx} className="bg-card rounded-xl border p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start gap-3 mb-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <feature.icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{feature.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 ms-12">
                  {feature.forRoles.map((role) => (
                    <span
                      key={role}
                      className={cn("text-xs px-2 py-0.5 rounded-full font-medium", roleColors[role] ?? "bg-muted text-muted-foreground")}
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tips & Tricks */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">3</span>
            {t("tutorial.tipsAndTricks")}
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {tips.map((tip, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-card rounded-xl border p-4">
                <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center text-accent-foreground shrink-0">
                  <tip.icon className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">{tip.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{tip.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Role Permissions Table */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">4</span>
            {t("tutorial.rolePermissions")}
          </h2>
          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-start px-4 py-3 font-semibold text-foreground">{t("tutorial.page")}</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">{t("tutorial.admin")}</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">{t("tutorial.doctor")}</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">{t("tutorial.receptionist")}</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">{t("tutorial.nurse")}</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">{t("tutorial.accountant")}</th>
                  </tr>
                </thead>
                <tbody>
                  {permissionsTable.map((row) => (
                    <tr key={row.page} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground">{row.page}</td>
                      {row.perms.map((has, i) => (
                        <td key={i} className="text-center px-3 py-2.5">
                          {has ? (
                            <CheckCircle2 className="h-4 w-4 text-primary mx-auto" />
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* CTA */}
        <div className="text-center pb-10">
          <div className="bg-primary/5 rounded-2xl border border-primary/10 p-8">
            <h2 className="text-xl font-bold text-foreground mb-2">{t("tutorial.readyToStart")}</h2>
            <p className="text-muted-foreground mb-5">{t("tutorial.readyDescription")}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => navigate("/login")} size="lg">
                {t("tutorial.goToLogin")}
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate("/login")}>
                {t("tutorial.tryDemo")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
