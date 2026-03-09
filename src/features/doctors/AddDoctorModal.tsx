import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AddDoctorModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const SPECIALTIES = [
  "Cardiology", "Orthopedics", "Pediatrics", "Dermatology", "Neurology",
  "General Practice", "Internal Medicine", "Surgery", "Ophthalmology", "ENT",
];

export const AddDoctorModal = ({ open, onClose, onSuccess }: AddDoctorModalProps) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    specialty: "General Practice",
    email: "",
    phone: "",
    status: "available",
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.specialty) {
      toast({ title: "Name and specialty required", variant: "destructive" });
      return;
    }
    setLoading(true);

    const { error } = await supabase.from("doctors").insert({
      tenant_id: user?.tenantId ?? "",
      full_name: form.full_name,
      specialty: form.specialty,
      email: form.email || null,
      phone: form.phone || null,
      status: form.status,
      rating: 0,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Doctor added successfully" });
      onSuccess();
      onClose();
      setForm({ full_name: "", specialty: "General Practice", email: "", phone: "", status: "available" });
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{t("doctors.addDoctor")}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>{t("patients.fullName")} *</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Dr. John Smith" />
          </div>
          <div className="space-y-2">
            <Label>{t("doctors.specialty")} *</Label>
            <select value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
              {SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>{t("common.email")}</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("common.phone")}</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>{t("common.status")}</Label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
              <option value="available">{t("doctors.available")}</option>
              <option value="busy">{t("doctors.busy")}</option>
              <option value="on_leave">{t("doctors.onLeave")}</option>
            </select>
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
