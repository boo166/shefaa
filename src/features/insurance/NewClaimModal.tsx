import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { insuranceService } from "@/services/insurance/insurance.service";
import type { InsuranceClaimCreateInput } from "@/domain/insurance/insurance.types";

interface NewClaimModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  patients: { id: string; full_name: string }[];
}

export const NewClaimModal = ({ open, onClose, onSuccess, patients }: NewClaimModalProps) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    patient_id: "",
    provider: "",
    service: "",
    amount: "",
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id || !form.provider || !form.service || !form.amount) {
      toast({ title: t("common.missingFields"), description: t("common.pleaseFillAllRequiredFields"), variant: "destructive" });
      return;
    }
    if (isDemo) {
      toast({ title: t("common.demoMode"), description: t("common.demoModeNoSave"), variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      await insuranceService.create({
        patient_id: form.patient_id,
        provider: form.provider,
        service: form.service,
        amount: Number.parseFloat(form.amount),
        status: "pending",
      } as InsuranceClaimCreateInput);
      toast({ title: t("insurance.claimSubmitted") });
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{t("insurance.newClaim")}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>{t("appointments.patient")} *</Label>
            <select
              value={form.patient_id}
              onChange={(e) => setForm({ ...form, patient_id: e.target.value })}
              className="w-full h-10 px-3 rounded-md border bg-background text-sm"
            >
              <option value="">{t("appointments.selectPatient")}</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("common.provider")} *</Label>
            <Input
              value={form.provider}
              onChange={(e) => setForm({ ...form, provider: e.target.value })}
              placeholder="National Health Co."
            />
          </div>
          <div className="space-y-2">
            <Label>{t("common.service")} *</Label>
            <Input
              value={form.service}
              onChange={(e) => setForm({ ...form, service: e.target.value })}
              placeholder="Cardiology Consultation"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("common.amount")} ($) *</Label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="350.00"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("common.loading") : t("common.save")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
