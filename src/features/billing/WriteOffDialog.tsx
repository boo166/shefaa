import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/primitives/Button";
import { Textarea } from "@/components/primitives/Inputs";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { billingService } from "@/services/billing/billing.service";
import type { InvoiceWithPatient } from "@/domain/billing/billing.types";

interface WriteOffDialogProps {
  invoice: InvoiceWithPatient | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function WriteOffDialog({ invoice, open, onClose, onSuccess }: WriteOffDialogProps) {
  const { t } = useI18n(["billing"]);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");

  const handleSubmit = async () => {
    if (!invoice || !reason.trim()) {
      toast({ title: t("common.missingFields"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await billingService.writeOffInvoice(invoice.id, reason.trim());
      toast({ title: t("billing.integrity.writeOffSuccess") });
      onSuccess();
      onClose();
    } catch (err) {
      toast({
        title: t("common.error"),
        description: err instanceof Error ? err.message : t("common.error"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("billing.integrity.writeOffTitle")}</DialogTitle>
          <DialogDescription>{t("billing.integrity.writeOffDescription")}</DialogDescription>
        </DialogHeader>
        {invoice ? (
          <div className="space-y-2">
            <Label>{t("billing.integrity.reasonRequired")}</Label>
            <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="destructive" onClick={() => void handleSubmit()} disabled={saving || !invoice}>{t("billing.integrity.writeOffAction")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
