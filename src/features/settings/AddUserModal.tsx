import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/core/i18n/i18nStore";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/primitives/Button";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/Inputs";
import { toast } from "@/hooks/use-toast";
import { userInviteService } from "@/services/settings/userInvite.service";
import type { InviteStaffInput } from "@/domain/settings/invite.types";
import { ensurePrivilegedActionSession } from "@/services/auth/privilegedActionSession.service";
import { isFreshAuthRequiredError } from "@/services/auth/recentAuth.service";
import { requestReauthentication } from "@/features/auth/reauthPrompt";
import {
  isMfaRequiredError,
  isPrivilegedMfaEnrollmentRequiredError,
} from "@/services/auth/privilegedAccess.service";
import { AuthorizationError } from "@/services/supabase/errors";

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ROLES = [
  { value: "clinic_admin", labelKey: "roles.clinic_admin" },
  { value: "doctor", labelKey: "roles.doctor" },
  { value: "receptionist", labelKey: "roles.receptionist" },
  { value: "nurse", labelKey: "roles.nurse" },
  { value: "accountant", labelKey: "roles.accountant" },
  { value: "pharmacist", labelKey: "roles.pharmacist" },
  { value: "lab_technician", labelKey: "roles.lab_technician" },
] as const;

export const AddUserModal = ({ open, onClose, onSuccess }: AddUserModalProps) => {
  const { t } = useI18n(["auth", "common", "settings"]);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "doctor",
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent, allowRetry = true) => {
    e.preventDefault();

    const fullName = form.full_name.trim();
    const email = form.email.trim().toLowerCase();

    if (!fullName || !email) {
      toast({ title: t("common.missingFields"), description: t("common.pleaseFillAllFields"), variant: "destructive" });
      return;
    }

    setLoading(true);

    const invitePayload = {
      email,
      full_name: fullName,
      role: form.role as InviteStaffInput["role"],
    };

    const reauthConfig = {
      title: t("auth.reauthTitle"),
      description: t("auth.reauthAdminActionDesc"),
      actionLabel: t("auth.reauthAction"),
      cancelLabel: t("common.cancel"),
    };

    try {
      await ensurePrivilegedActionSession(reauthConfig);
      await userInviteService.inviteStaff(invitePayload);
      toast({
        title: t("settings.addUser"),
        description: t("auth.confirmationSent"),
      });
      onSuccess();
      onClose();
      setForm({ full_name: "", email: "", role: "doctor" });
    } catch (err) {
      if (isPrivilegedMfaEnrollmentRequiredError(err)) {
        toast({
          title: t("auth.access.privilegedRequiredTitle"),
          description: t("auth.mfa.clinicAdminDescription"),
          variant: "destructive",
        });
        onClose();
        navigate("/security/privileged");
        return;
      }
      if (isMfaRequiredError(err)) {
        toast({
          title: t("auth.mfa.sessionActionRequired"),
          description: err.message || t("auth.mfa.clinicAdminDescription"),
          variant: "destructive",
        });
        return;
      }
      if (err instanceof AuthorizationError && err.code === "NOT_AUTHENTICATED") {
        toast({
          title: t("common.error"),
          description: err.message,
          variant: "destructive",
        });
        onClose();
        navigate("/login");
        return;
      }
      if (allowRetry && isFreshAuthRequiredError(err)) {
        try {
          await requestReauthentication(reauthConfig);
          await userInviteService.inviteStaff(invitePayload);
          toast({
            title: t("settings.addUser"),
            description: t("auth.confirmationSent"),
          });
          onSuccess();
          onClose();
          setForm({ full_name: "", email: "", role: "doctor" });
        } catch (retryErr) {
          if (retryErr instanceof Error && retryErr.message.includes("cancelled")) {
            return;
          }
          const message = retryErr instanceof Error ? retryErr.message : t("common.error");
          toast({ title: t("common.error"), description: message, variant: "destructive" });
        }
        return;
      }
      if (err instanceof Error && err.message.includes("cancelled")) {
        return;
      }
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.addUser")}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t("settings.addUser")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("auth.fullName")} *</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Smith" />
          </div>
          <div className="space-y-2">
            <Label>{t("common.email")} *</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@clinic.com" />
          </div>
          <div className="space-y-2">
            <Label>{t("settings.usersRoles")} *</Label>
            <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value })}>
              <SelectTrigger>
                <SelectValue placeholder={t("settings.usersRoles")} />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {t(r.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={loading}>
              {t("settings.addUser")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
