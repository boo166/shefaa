import { useNavigate } from "react-router-dom";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
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

interface Step {
  icon: React.ElementType;
  title: string;
  description: string;
  details: string[];
  color: string;
}

const gettingStartedSteps: Step[] = [
  {
    icon: UserPlus,
    title: "1. Create Your Clinic",
    description: "Sign up and set up your clinic workspace in seconds.",
    details: [
      "Click 'Register' on the login page",
      "Enter your full name, clinic name, email & password",
      "A unique workspace is created for your clinic automatically",
      "Verify your email to activate your account",
    ],
    color: "hsl(var(--primary))",
  },
  {
    icon: LogIn,
    title: "2. Log In",
    description: "Access your clinic dashboard with your credentials.",
    details: [
      "Enter your email and password",
      "You'll be redirected to your clinic's dashboard",
      "Your session stays active — no need to log in every time",
      "Forgot your password? Use the reset link on the login page",
    ],
    color: "hsl(var(--info))",
  },
  {
    icon: Users,
    title: "3. Add Your Team",
    description: "Invite doctors, nurses, receptionists, and accountants.",
    details: [
      "Go to Settings to manage your clinic team",
      "Each team member gets a role with specific permissions",
      "Doctors see medical records, receptionists manage scheduling",
      "Accountants handle billing — everyone sees only what they need",
    ],
    color: "hsl(var(--success))",
  },
  {
    icon: LayoutDashboard,
    title: "4. Start Managing",
    description: "Use the dashboard to run your clinic day-to-day.",
    details: [
      "Register patients and schedule appointments",
      "Track billing, pharmacy stock, and lab orders",
      "Monitor clinic performance with real-time stats",
      "Export data anytime with one-click CSV export",
    ],
    color: "hsl(var(--warning))",
  },
];

interface Feature {
  icon: React.ElementType;
  title: string;
  description: string;
  forRoles: string[];
}

const features: Feature[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    description: "At-a-glance view of patients, appointments, doctors, and revenue. Your clinic's command center.",
    forRoles: ["All roles"],
  },
  {
    icon: Users,
    title: "Patients",
    description: "Register patients, search records, view medical history, and track status (active/inactive).",
    forRoles: ["Admin", "Doctor", "Receptionist", "Nurse"],
  },
  {
    icon: CalendarDays,
    title: "Appointments",
    description: "Schedule, view, and manage patient appointments. Filter by status: scheduled, in progress, completed.",
    forRoles: ["Admin", "Doctor", "Receptionist", "Nurse"],
  },
  {
    icon: Stethoscope,
    title: "Doctors",
    description: "View doctor directory with specialties, availability, ratings, and contact information.",
    forRoles: ["Admin", "Doctor", "Receptionist", "Nurse"],
  },
  {
    icon: Receipt,
    title: "Billing",
    description: "Create invoices, track payments (pending/paid/overdue), and manage financial records.",
    forRoles: ["Admin", "Accountant"],
  },
  {
    icon: Pill,
    title: "Pharmacy",
    description: "Manage medication inventory, track stock levels, and get low-stock alerts.",
    forRoles: ["Admin"],
  },
  {
    icon: FlaskConical,
    title: "Laboratory",
    description: "Order lab tests, track results, and link them to patient records.",
    forRoles: ["Admin"],
  },
  {
    icon: Shield,
    title: "Insurance",
    description: "Submit insurance claims, track approval status, and manage providers.",
    forRoles: ["Admin", "Accountant"],
  },
  {
    icon: BarChart3,
    title: "Reports",
    description: "View analytics and generate reports for clinic performance insights.",
    forRoles: ["Admin", "Accountant"],
  },
  {
    icon: Settings,
    title: "Settings",
    description: "Update clinic information, manage team members, and configure your workspace.",
    forRoles: ["Admin"],
  },
];

const tips = [
  { icon: Bell, title: "Notifications", text: "Click the bell icon in the top bar to see upcoming appointments, lab results, payments, and stock alerts." },
  { icon: Download, title: "Export Data", text: "Every table has a CSV button — export patient lists, invoices, or appointments with one click." },
  { icon: Globe, title: "Language", text: "Switch between English and Arabic anytime using the language button in the top bar." },
  { icon: ShieldCheck, title: "Security", text: "Each clinic's data is completely isolated. Team members only see pages relevant to their role." },
];

const roleColors: Record<string, string> = {
  "Admin": "bg-primary/10 text-primary",
  "Doctor": "bg-info/10 text-info",
  "Receptionist": "bg-success/10 text-success",
  "Nurse": "bg-warning/10 text-warning",
  "Accountant": "bg-destructive/10 text-destructive",
  "All roles": "bg-muted text-muted-foreground",
};

export const TutorialPage = () => {
  const navigate = useNavigate();
  const [expandedStep, setExpandedStep] = useState<number | null>(0);

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
            Back to Login
          </button>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
            <Play className="h-3.5 w-3.5" />
            Getting Started Guide
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Welcome to <span className="text-primary">MedFlow</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Your complete clinic management platform. Follow this guide to set up and start managing your clinic in minutes.
          </p>
        </div>

        {/* Getting Started Steps */}
        <section className="mb-16">
          <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">1</span>
            Getting Started
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
            Features Overview
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
            Tips & Tricks
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
            Role Permissions
          </h2>
          <div className="bg-card rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="text-start px-4 py-3 font-semibold text-foreground">Page</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">Admin</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">Doctor</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">Receptionist</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">Nurse</th>
                    <th className="text-center px-3 py-3 font-semibold text-foreground">Accountant</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { page: "Dashboard", perms: [true, true, true, true, true] },
                    { page: "Patients", perms: [true, true, true, true, false] },
                    { page: "Appointments", perms: [true, true, true, true, false] },
                    { page: "Doctors", perms: [true, true, true, true, true] },
                    { page: "Billing", perms: [true, false, false, false, true] },
                    { page: "Pharmacy", perms: [true, false, false, false, false] },
                    { page: "Laboratory", perms: [true, false, false, false, false] },
                    { page: "Insurance", perms: [true, false, false, false, true] },
                    { page: "Reports", perms: [true, false, false, false, true] },
                    { page: "Settings", perms: [true, false, false, false, false] },
                  ].map((row) => (
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
            <h2 className="text-xl font-bold text-foreground mb-2">Ready to get started?</h2>
            <p className="text-muted-foreground mb-5">Create your clinic account or try the demo to explore all features.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => navigate("/login")} size="lg">
                Go to Login
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate("/login")}>
                Try Demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
