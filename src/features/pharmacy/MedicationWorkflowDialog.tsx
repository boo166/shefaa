import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/core/i18n/i18nStore";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Inputs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { pharmacyClinicalService } from "@/services/pharmacy/pharmacyClinical.service";
import type { Medication } from "@/domain/pharmacy/medication.types";

type MedicationWorkflowDialogProps = {
  medication: Medication | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function MedicationWorkflowDialog({ medication, open, onClose, onSuccess }: MedicationWorkflowDialogProps) {
  const { t } = useI18n(["pharmacy"]);
  const [quantity, setQuantity] = useState("1");
  const [working, setWorking] = useState(false);

  const reservationsQuery = useQuery({
    queryKey: ["medicationReservations", medication?.id],
    queryFn: () => pharmacyClinicalService.listActiveReservations(medication!.id),
    enabled: open && !!medication?.id,
  });

  const handleReserve = async () => {
    if (!medication) return;
    setWorking(true);
    try {
      await pharmacyClinicalService.reserve(medication.id, Number.parseInt(quantity, 10));
      toast({ title: t("pharmacy.workflow.reserved") });
      await reservationsQuery.refetch();
      onSuccess();
    } catch (err) {
      toast({ title: t("common.error"), description: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  const handleDispense = async (reservationId: string, qty: number) => {
    setWorking(true);
    try {
      await pharmacyClinicalService.dispense(reservationId, qty);
      toast({ title: t("pharmacy.workflow.dispensed") });
      await reservationsQuery.refetch();
      onSuccess();
    } catch (err) {
      toast({ title: t("common.error"), description: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  const handleRelease = async (reservationId: string) => {
    setWorking(true);
    try {
      await pharmacyClinicalService.release(reservationId);
      toast({ title: t("pharmacy.workflow.released") });
      await reservationsQuery.refetch();
      onSuccess();
    } catch (err) {
      toast({ title: t("common.error"), description: err instanceof Error ? err.message : t("common.error"), variant: "destructive" });
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pharmacy.workflow.title")}</DialogTitle>
          <DialogDescription>{medication?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>{t("pharmacy.workflow.quantity")}</Label>
              <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <Button onClick={() => void handleReserve()} disabled={working}>{t("pharmacy.workflow.reserve")}</Button>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">{t("pharmacy.workflow.activeReservations")}</h3>
            {(reservationsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("pharmacy.workflow.noReservations")}</p>
            ) : (
              <ul className="space-y-2">
                {(reservationsQuery.data ?? []).map((reservation) => (
                  <li key={reservation.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                    <span>{reservation.quantity} · {new Date(reservation.reserved_at).toLocaleString()}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={working} onClick={() => void handleDispense(reservation.id, reservation.quantity)}>
                        {t("pharmacy.workflow.dispense")}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={working} onClick={() => void handleRelease(reservation.id)}>
                        {t("pharmacy.workflow.release")}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
