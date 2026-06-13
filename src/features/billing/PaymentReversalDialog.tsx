import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/core/i18n/i18nStore";
import { selectEffectiveTenantId, useAuth } from "@/core/auth/authStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/primitives/Button";
import { Textarea } from "@/components/primitives/Inputs";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDate } from "@/shared/utils/formatDate";
import { toast } from "@/hooks/use-toast";
import { billingService } from "@/services/billing/billing.service";
import { queryKeys } from "@/services/queryKeys";
import type { InvoiceWithPatient } from "@/domain/billing/billing.types";

interface PaymentReversalDialogProps {
  invoice: InvoiceWithPatient | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentReversalDialog({ invoice, open, onClose, onSuccess }: PaymentReversalDialogProps) {
  const { t, locale, calendarType } = useI18n(["billing"]);
  const billingTenantId = useAuth(selectEffectiveTenantId);
  const [saving, setSaving] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const paymentHistoryQuery = useQuery({
    queryKey: queryKeys.billing.payments(invoice?.id ?? "", billingTenantId ?? undefined),
    queryFn: async () => billingService.listPayments(invoice!.id),
    enabled: open && !!invoice?.id && !!billingTenantId,
  });

  const handleSubmit = async () => {
    if (!selectedPaymentId || !reason.trim()) {
      toast({ title: t("common.missingFields"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await billingService.reversePayment(selectedPaymentId, reason.trim());
      toast({ title: t("billing.integrity.reversalSuccess") });
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("billing.integrity.reversalTitle")}</DialogTitle>
          <DialogDescription>{t("billing.integrity.reversalDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("billing.integrity.selectPayment")}</Label>
            <div className="rounded-lg border divide-y max-h-48 overflow-y-auto">
              {(paymentHistoryQuery.data ?? []).map((payment) => (
                <button
                  key={payment.id}
                  type="button"
                  className={`w-full p-3 text-start text-sm hover:bg-muted/50 ${selectedPaymentId === payment.id ? "bg-primary/5" : ""}`}
                  onClick={() => setSelectedPaymentId(payment.id)}
                >
                  <div className="font-medium">{formatCurrency(Number(payment.amount), locale)}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(payment.paid_at, locale, "datetime", calendarType)}</div>
                </button>
              ))}
              {(paymentHistoryQuery.data?.length ?? 0) === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">{t("billing.payment.emptyHistory")}</div>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("billing.integrity.reasonRequired")}</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !selectedPaymentId}>{t("billing.integrity.reversalAction")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
