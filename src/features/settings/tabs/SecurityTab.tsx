import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { securityService } from "@/services/settings/security.service";

export const SecurityTab = () => {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (isDemo) {
      toast({ title: t("common.demoMode"), variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: t("common.passwordsDontMatch"), variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: t("common.passwordMinLength"), variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      await securityService.updatePassword(newPassword);
      toast({ title: t("auth.passwordUpdated"), description: t("auth.passwordUpdatedDesc") });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-lg">{t("settings.changePassword")}</h3>
      <div className="space-y-4 max-w-sm">
        <div className="space-y-2">
          <Label>{t("settings.newPassword")}</Label>
          <div className="relative">
            <Input
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("common.mustBeAtLeast6")}
            />
            <button
              type="button"
              onClick={() => setShowPasswords(!showPasswords)}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("settings.confirmPassword")}</Label>
          <Input
            type={showPasswords ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t("settings.confirmPassword")}
          />
        </div>
        <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword}>
          {changingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("settings.updatePassword")}
        </Button>
      </div>

      <div className="border-t pt-6">
        <h4 className="font-medium text-sm text-destructive mb-2">{t("common.dangerZone")}</h4>
        <Button variant="outline" className="text-destructive border-destructive/50" onClick={logout}>
          {t("common.signOut")}
        </Button>
      </div>
    </div>
  );
};
