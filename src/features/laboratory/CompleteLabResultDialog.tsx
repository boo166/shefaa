import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/core/i18n/i18nStore";
import { Button } from "@/components/primitives/Button";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/primitives/Inputs";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { labService } from "@/services/laboratory/lab.service";
import type { LabOrderWithPatientDoctor } from "@/domain/lab/lab.types";

type LabAbnormalFlag = "normal" | "abnormal" | "high" | "low" | "critical";

interface CompleteLabResultDialogProps {
  labOrder: LabOrderWithPatientDoctor | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const defaultForm = () => ({
  result_value: "",
  result_unit: "",
  reference_range: "",
  abnormal_flag: "normal" as LabAbnormalFlag,
  result_notes: "",
  amendment_reason: "",
});

export const CompleteLabResultDialog = ({
  labOrder,
  open,
  onClose,
  onSuccess,
}: CompleteLabResultDialogProps) => {
  const { t } = useI18n(["laboratory", "common"]);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const isEditingCompletedResult = labOrder?.status === "completed";

  const versionsQuery = useQuery({
    queryKey: ["labResultVersions", labOrder?.id],
    queryFn: () => labService.listResultVersions(labOrder!.id),
    enabled: open && !!labOrder?.id && isEditingCompletedResult,
  });

  useEffect(() => {
    if (!open || !labOrder) return;
    setForm({
      result_value: labOrder.result_value ?? "",
      result_unit: labOrder.result_unit ?? "",
      reference_range: labOrder.reference_range ?? "",
      abnormal_flag: labOrder.abnormal_flag ?? "normal",
      result_notes: labOrder.result_notes ?? "",
      amendment_reason: "",
    });
  }, [open, labOrder]);

  const handleSave = async () => {
    if (!labOrder) return;
    if (!form.result_value.trim()) {
      toast({
        title: t("common.missingFields"),
        description: t("common.pleaseFillAllRequiredFields"),
        variant: "destructive",
      });
      return;
    }
    if (isEditingCompletedResult && !form.amendment_reason.trim()) {
      toast({
        title: t("laboratory.amend.reasonRequired"),
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await labService.update(labOrder.id, {
        status: "completed",
        result_value: form.result_value,
        result_unit: form.result_unit || null,
        reference_range: form.reference_range || null,
        abnormal_flag: form.abnormal_flag,
        result_notes: form.result_notes || null,
        amendment_reason: isEditingCompletedResult ? form.amendment_reason.trim() : undefined,
      } as any);
      toast({ title: isEditingCompletedResult ? t("laboratory.amend.success") : t("laboratory.resultCompleted") });
      onSuccess();
      onClose();
      setForm(defaultForm());
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditingCompletedResult ? t("laboratory.amend.title") : t("laboratory.completeResult")}</DialogTitle>
          <DialogDescription>{labOrder?.test_name}</DialogDescription>
        </DialogHeader>

        {isEditingCompletedResult && (versionsQuery.data?.length ?? 0) > 0 ? (
          <div className="rounded-lg border p-3 space-y-2 max-h-40 overflow-y-auto">
            <h3 className="text-sm font-medium">{t("laboratory.amend.history")}</h3>
            {(versionsQuery.data ?? []).map((version: any) => (
              <div key={version.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">V{version.version_number}</span>
                {" · "}
                {[version.result_value, version.result_unit].filter(Boolean).join(" ")}
                {version.amendment_reason ? ` — ${version.amendment_reason}` : ""}
              </div>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>{t("laboratory.resultValue")}</Label>
            <Input value={form.result_value} onChange={(e) => setForm((prev) => ({ ...prev, result_value: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("laboratory.resultUnit")}</Label>
            <Input value={form.result_unit} onChange={(e) => setForm((prev) => ({ ...prev, result_unit: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("laboratory.referenceRange")}</Label>
            <Input value={form.reference_range} onChange={(e) => setForm((prev) => ({ ...prev, reference_range: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>{t("laboratory.abnormalFlag")}</Label>
            <Select value={form.abnormal_flag} onValueChange={(value) => setForm((prev) => ({ ...prev, abnormal_flag: value as LabAbnormalFlag }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">{t("laboratory.flags.normal")}</SelectItem>
                <SelectItem value="abnormal">{t("laboratory.flags.abnormal")}</SelectItem>
                <SelectItem value="high">{t("laboratory.flags.high")}</SelectItem>
                <SelectItem value="low">{t("laboratory.flags.low")}</SelectItem>
                <SelectItem value="critical">{t("laboratory.flags.critical")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>{t("laboratory.notes")}</Label>
            <Textarea rows={3} value={form.result_notes} onChange={(e) => setForm((prev) => ({ ...prev, result_notes: e.target.value }))} />
          </div>
          {isEditingCompletedResult ? (
            <div className="space-y-2 md:col-span-2">
              <Label>{t("laboratory.amend.reasonLabel")}</Label>
              <Textarea rows={2} value={form.amendment_reason} onChange={(e) => setForm((prev) => ({ ...prev, amendment_reason: e.target.value }))} />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {isEditingCompletedResult ? t("laboratory.amend.action") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
