import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
] as const;

export const AddUserModal = ({ open, onClose, onSuccess }: AddUserModalProps) => {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    role: "doctor",
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.full_name || !form.email) {
      toast({ title: t("common.missingFields"), description: t("common.pleaseFillAllFields"), variant: "destructive" });
      return;
    }

    setLoading(true);

    // Secure invite flow: server issues invite + signup email with invite metadata.
    const { data, error } = await supabase.functions.invoke("invite-staff", {
      body: {
        email: form.email,
        full_name: form.full_name,
        role: form.role,
      },
    });

    if (error || data?.error) {
      toast({ title: t("common.error"), description: error?.message || data?.error, variant: "destructive" });
    } else {
      toast({
        title: t("settings.addUser"),
        description: t("auth.confirmationSent"),
      });
      onSuccess();
      onClose();
      setForm({ full_name: "", email: "", role: "doctor" });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{t("settings.addUser")}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
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
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full h-10 px-3 rounded-md border bg-background text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? t("common.loading") : t("settings.addUser")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
