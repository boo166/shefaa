import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { pharmacyService } from "@/services/pharmacy/pharmacy.service";
import type { MedicationCreateInput } from "@/domain/pharmacy/medication.types";

interface AddMedicationModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const CATEGORIES = [
  "Antihypertensive", "Antidiabetic", "Antibiotic", "Analgesic", "Antihistamine",
  "Proton Pump Inhibitor", "Statin", "NSAID", "Vitamin", "Other",
];

export const AddMedicationModal = ({ open, onClose, onSuccess }: AddMedicationModalProps) => {
  const { t } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Other",
    stock: "",
    unit: "tablets",
    price: "",
  });

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      toast({ title: "Medication name required", variant: "destructive" });
      return;
    }
    if (isDemo) {
      toast({ title: t("common.demoMode"), description: t("common.demoModeNoSave"), variant: "destructive" });
      return;
    }
    setLoading(true);

    const stock = Number.parseInt(form.stock, 10) || 0;
    const status: MedicationCreateInput["status"] = stock === 0 ? "out_of_stock" : stock < 50 ? "low_stock" : "in_stock";

    try {
      await pharmacyService.create({
        name: form.name,
        category: form.category,
        stock,
        unit: form.unit,
        price: Number.parseFloat(form.price) || 0,
        status,
      });
      toast({ title: "Medication added successfully" });
      onSuccess();
      onClose();
      setForm({ name: "", category: "Other", stock: "", unit: "tablets", price: "" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-lg border shadow-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">{t("pharmacy.addMedication")}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <Label>{t("pharmacy.medication")} *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Lisinopril 10mg" />
          </div>
          <div className="space-y-2">
            <Label>{t("common.category")}</Label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("common.stock")}</Label>
              <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} placeholder="100" />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full h-10 px-3 rounded-md border bg-background text-sm">
                <option value="tablets">Tablets</option>
                <option value="capsules">Capsules</option>
                <option value="ml">ML</option>
                <option value="mg">MG</option>
                <option value="units">Units</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("common.price")} ($)</Label>
            <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="12.50" />
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
