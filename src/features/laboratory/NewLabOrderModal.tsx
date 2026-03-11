import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { labService } from "@/services/laboratory/lab.service";
import type { LabResultCreateInput } from "@/domain/lab/lab.types";

interface NewLabOrderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  patients: { id: string; full_name: string }[];
  doctors: { id: string; full_name: string }[];
}

const TEST_OPTIONS = [
  "Complete Blood Count (CBC)",
  "HbA1c",
  "Lipid Panel",
  "Thyroid Panel",
  "Basic Metabolic Panel",
  "Comprehensive Metabolic Panel",
  "Liver Function Test",
  "Kidney Function Test",
  "Urinalysis",
  "Blood Glucose",
  "Hemoglobin",
];

export const NewLabOrderModal = ({ open, onClose, onSuccess, patients, doctors }: NewLabOrderModalProps) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    patient_id: "",
    doctor_id: "",
    test_name: "Complete Blood Count (CBC)",
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.patient_id || !form.doctor_id || !form.test_name) {
      toast({ title: t("common.missingFields"), description: t("common.pleaseFillAllRequiredFields"), variant: "destructive" });
      return;
    }
    if (isDemo) {
      toast({ title: t("common.demoMode"), description: t("common.demoModeNoSave"), variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      await labService.create({
        patient_id: form.patient_id,
        doctor_id: form.doctor_id,
        test_name: form.test_name,
        status: "pending",
      } as LabResultCreateInput);
      toast({ title: t("laboratory.labOrderCreated") });
      onSuccess();
      onClose();
      setForm({ patient_id: "", doctor_id: "", test_name: "Complete Blood Count (CBC)" });
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
          <h2 className="text-lg font-semibold">{t("laboratory.newLabOrder")}</h2>
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
            <Label>{t("laboratory.orderedBy")} *</Label>
            <select
              value={form.doctor_id}
              onChange={(e) => setForm({ ...form, doctor_id: e.target.value })}
              className="w-full h-10 px-3 rounded-md border bg-background text-sm"
            >
              <option value="">{t("appointments.selectDoctor")}</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("laboratory.test")} *</Label>
            <select
              value={form.test_name}
              onChange={(e) => setForm({ ...form, test_name: e.target.value })}
              className="w-full h-10 px-3 rounded-md border bg-background text-sm"
            >
              {TEST_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
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
