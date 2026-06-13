import { useState } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/primitives/Button";
import { Input, Textarea } from "@/components/primitives/Inputs";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/shared/utils/formatDate";
import { toast } from "@/hooks/use-toast";
import { billingService } from "@/services/billing/billing.service";
import type { InvoiceWithPatient } from "@/domain/billing/billing.types";

interface RefundDialogProps {
  invoice: InvoiceWithPatient | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function RefundDialog({ invoice, open, onClose, onSuccess }: RefundDialogProps) {
  const { t, locale } = useI18n(["billing"]);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");

  const maxRefund = Number(invoice?.amount_paid ?? 0);

  const handleSubmit = async () => {
    if (!invoice || !amount.trim() || !reason.trim()) {
      toast({ title: t("common.missingFields"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await billingService.refundInvoice(invoice.id, {
        amount: Number.parseFloat(amount),
        reason: reason.trim(),
        reference: reference.trim() || null,
      });
      toast({ title: t("billing.integrity.refundSuccess") });
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
          <DialogTitle>{t("billing.integrity.refundTitle")}</DialogTitle>
          <DialogDescription>{t("billing.integrity.refundDescription")}</DialogDescription>
        </DialogHeader>
        {invoice ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {invoice.invoice_code} · {t("billing.integrity.maxRefund", { amount: formatCurrency(maxRefund, locale) })}
            </p>
            <div className="space-y-2">
              <Label>{t("billing.payment.amountRequired")}</Label>
              <Input type="number" step="0.01" min="0.01" max={String(maxRefund)} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("billing.integrity.reasonRequired")}</Label>
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("billing.payment.reference")}</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !invoice}>{t("billing.integrity.refundAction")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
