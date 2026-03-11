import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { patientService } from "@/services/patients/patient.service";

interface AddPatientModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddPatientModal = ({ open, onClose, onSuccess }: AddPatientModalProps) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    date_of_birth: "",
    gender: "male",
    blood_type: "",
    phone: "",
    email: "",
    insurance_provider: "",
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setLoading(true);

    if (user?.tenantId === "demo") {
      toast({ title: t("common.demoMode"), variant: "destructive" });
      setLoading(false);
      return;
    }

    try {
      await patientService.create({
        full_name: form.full_name,
        date_of_birth: form.date_of_birth || null,
        gender: (form.gender || undefined) as "male" | "female" | undefined,
        blood_type: (form.blood_type || undefined) as "A+" | "A-" | "AB+" | "AB-" | "B+" | "B-" | "O+" | "O-" | undefined,
        phone: form.phone || null,
        email: form.email || null,
        insurance_provider: form.insurance_provider || null,
      });
      toast({ title: t("patients.addPatient"), description: "Patient added successfully" });
      onSuccess();
      onClose();
      setForm({ full_name: "", date_of_birth: "", gender: "male", blood_type: "", phone: "", email: "", insurance_provider: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err?.message ?? "Failed to add patient", variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{t("patients.addPatient")}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label>{t("patients.fullName")} *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("patients.dateOfBirth")}</Label>
              <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("patients.gender")}</Label>
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="male">{t("patients.male")}</option>
                <option value="female">{t("patients.female")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t("patients.bloodType")}</Label>
              <Input value={form.blood_type} onChange={(e) => setForm({ ...form, blood_type: e.target.value })} placeholder="A+" />
            </div>
            <div className="space-y-2">
              <Label>{t("common.phone")}</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t("common.email")}</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Insurance</Label>
              <Input value={form.insurance_provider} onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={loading}>{loading ? "..." : t("common.save")}</Button>
          </div>
        </form>
      </div>
    </div>
  );
};
