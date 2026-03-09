import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, Role } from "@/core/auth/authStore";
import { useI18n } from "@/core/i18n/i18nStore";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type AuthMode = "login" | "signup";

export const LoginPage = () => {
  const { isAuthenticated, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if already logged in (useEffect to avoid render-time side effects)
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(`/tenant/${user.tenantSlug}/dashboard`, { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: t("auth.loginFailed"), description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    // Auth state listener will handle the rest
    setLoading(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !clinicName) {
      toast({
        title: t("common.missingFields"),
        description: t("common.pleaseFillAllFields"),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);

    // Create tenant via secure function
    const slug = clinicName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const { data: tenantId, error: tenantErr } = await supabase.rpc("create_tenant_and_signup", {
      _name: clinicName,
      _slug: slug,
    });

    const tenantIdValue = tenantErr ? undefined : tenantId;

    // Sign up with tenant_id in metadata
    const { error: signupErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          tenant_id: tenantIdValue,
          role: "clinic_admin",
        },
        emailRedirectTo: window.location.origin,
      },
    });

    if (signupErr) {
      toast({ title: t("auth.signupFailed"), description: signupErr.message, variant: "destructive" });
    } else {
      toast({ title: t("auth.checkEmail"), description: t("auth.confirmationSent") });
    }
    setLoading(false);
  };

  // Demo login (creates a demo session with local state only)
  const demoLogin = (name: string, emailVal: string, role: Role) => {
    useAuth.getState().setUser({
      id: "demo-user",
      name,
      email: emailVal,
      role,
      tenantId: "demo",
      tenantSlug: "demo-clinic",
      tenantName: "MedFlow Demo Clinic",
    });
    navigate("/tenant/demo-clinic/dashboard");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative items-center justify-center">
        <div className="text-primary-foreground text-center px-12">
          <div className="h-16 w-16 rounded-2xl bg-primary-foreground/20 flex items-center justify-center text-3xl font-bold mx-auto mb-6">M</div>
          <h2 className="text-3xl font-bold mb-4">MedFlow</h2>
          <p className="text-primary-foreground/80 text-lg">{t("auth.heroSubtitle")}</p>
          <div className="mt-12 grid grid-cols-2 gap-4 text-sm text-primary-foreground/70">
            <div className="bg-primary-foreground/10 rounded-lg p-4">{t("auth.featureMultiTenant")}</div>
            <div className="bg-primary-foreground/10 rounded-lg p-4">{t("auth.featureRbac")}</div>
            <div className="bg-primary-foreground/10 rounded-lg p-4">{t("auth.featureEmr")}</div>
            <div className="bg-primary-foreground/10 rounded-lg p-4">{t("auth.featureBilingual")}</div>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex justify-end mb-8">
            <LanguageSwitcher />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-2">
              {mode === "login" ? t("auth.loginTitle") : t("auth.createClinic")}
            </h1>
            <p className="text-muted-foreground">
              {mode === "login" ? t("auth.loginSubtitle") : t("auth.setupNewClinic")}
            </p>
          </div>

          <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label>{t("auth.fullName")}</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dr. John Smith" />
                </div>
                <div className="space-y-2">
                  <Label>{t("auth.clinicName")}</Label>
                  <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} placeholder="My Clinic" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>{t("auth.emailLabel")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label>{t("auth.passwordLabel")}</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("common.loading") : mode === "login" ? t("auth.login") : t("auth.createAccount")}
            </Button>
          </form>

          <div className="mt-3 text-end">
            <button
              onClick={() => navigate("/forgot-password")}
              className="text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              {t("auth.forgotPassword")}
            </button>
          </div>

          <div className="mt-4 text-center text-sm">
            {mode === "login" ? (
              <p className="text-muted-foreground">
                {t("auth.noAccount")} {" "}
                <button onClick={() => setMode("signup")} className="text-primary font-medium hover:underline">
                  {t("auth.register")}
                </button>
              </p>
            ) : (
              <p className="text-muted-foreground">
                {t("auth.alreadyHaveAccount")} {" "}
                <button onClick={() => setMode("login")} className="text-primary font-medium hover:underline">
                  {t("auth.login")}
                </button>
              </p>
            )}
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate("/tutorial")}
              className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
            >
              📖 {t("auth.howToUse")}
            </button>
          </div>

          <div className="mt-6">
            <p className="text-xs text-muted-foreground mb-3">{t("auth.demoLogin")}</p>
            <div className="space-y-2">
              {[
                { name: "Dr. Sarah Ahmed", email: "admin@medflow.com", role: "clinic_admin" as Role },
                { name: "Dr. John Smith", email: "doctor@medflow.com", role: "doctor" as Role },
                { name: "Emily Davis", email: "receptionist@medflow.com", role: "receptionist" as Role },
                { name: "Linda Carter", email: "nurse@medflow.com", role: "nurse" as Role },
                { name: "James Wilson", email: "accountant@medflow.com", role: "accountant" as Role },
              ].map((u) => (
                <button
                  key={u.email}
                  onClick={() => demoLogin(u.name, u.email, u.role)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-start"
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {u.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{t(`roles.${u.role}`)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
