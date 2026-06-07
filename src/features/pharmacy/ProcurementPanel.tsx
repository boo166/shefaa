import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Plus, ShoppingCart } from "lucide-react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { Button } from "@/components/primitives/Button";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@/components/primitives/Inputs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/shared/components/StatusBadge";
import { toast } from "@/hooks/use-toast";
import { procurementService } from "@/services/procurement/procurement.service";
import { queryKeys } from "@/services/queryKeys";
import { formatCurrency } from "@/shared/utils/formatDate";
import type { Medication } from "@/domain/pharmacy/medication.types";
import type { PurchaseOrder, Supplier } from "@/domain/procurement/procurement.types";

type ProcurementPanelProps = {
  medications: Pick<Medication, "id" | "name" | "price">[];
};

const orderStatusVariant: Record<string, "success" | "warning" | "destructive" | "default"> = {
  draft: "default",
  submitted: "warning",
  received: "success",
  cancelled: "destructive",
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function ProcurementPanel({ medications }: ProcurementPanelProps) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [supplierName, setSupplierName] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedMedicationId, setSelectedMedicationId] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");

  const supplierArgs = useMemo(() => ({
    tenantId: user?.tenantId,
    page: 1,
    pageSize: 5,
    filters: { status: "active" },
    sort: { column: "created_at", ascending: false },
  }), [user?.tenantId]);

  const purchaseOrderArgs = useMemo(() => ({
    tenantId: user?.tenantId,
    page: 1,
    pageSize: 5,
    sort: { column: "created_at", ascending: false },
  }), [user?.tenantId]);

  const { data: suppliersPage, isLoading: suppliersLoading } = useQuery({
    queryKey: queryKeys.procurement.suppliers(supplierArgs),
    queryFn: () => procurementService.listSuppliers(supplierArgs),
    enabled: !!user?.tenantId,
  });

  const { data: purchaseOrdersPage, isLoading: ordersLoading } = useQuery({
    queryKey: queryKeys.procurement.purchaseOrders(purchaseOrderArgs),
    queryFn: () => procurementService.listPurchaseOrders(purchaseOrderArgs),
    enabled: !!user?.tenantId,
  });

  const suppliers = suppliersPage?.data ?? [];
  const purchaseOrders = purchaseOrdersPage?.data ?? [];

  useEffect(() => {
    if (!selectedSupplierId && suppliers[0]) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [selectedSupplierId, suppliers]);

  useEffect(() => {
    if (!selectedMedicationId && medications[0]) {
      setSelectedMedicationId(medications[0].id);
      setUnitCost(String(Number(medications[0].price) || 0));
    }
  }, [medications, selectedMedicationId]);

  const invalidateProcurement = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.procurement.root(user?.tenantId) });
  };

  const createSupplierMutation = useMutation({
    mutationFn: () => procurementService.createSupplier({
      name: supplierName.trim(),
      email: supplierEmail.trim() || null,
    }),
    onSuccess: () => {
      setSupplierName("");
      setSupplierEmail("");
      invalidateProcurement();
      toast({ title: t("pharmacy.supplierCreated") });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    },
  });

  const createPurchaseOrderMutation = useMutation({
    mutationFn: () => procurementService.createPurchaseOrder({
      supplier_id: selectedSupplierId,
      status: "submitted",
      order_date: todayDate(),
      notes: notes.trim() || null,
      items: [{
        medication_id: selectedMedicationId,
        quantity: Number(quantity),
        unit_cost: Number(unitCost),
      }],
    }),
    onSuccess: () => {
      setNotes("");
      invalidateProcurement();
      toast({ title: t("pharmacy.purchaseOrderCreated") });
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    },
  });

  const handleCreateSupplier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supplierName.trim()) {
      toast({ title: t("common.missingFields"), description: t("pharmacy.supplierName"), variant: "destructive" });
      return;
    }
    createSupplierMutation.mutate();
  };

  const handleCreatePurchaseOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSupplierId || !selectedMedicationId || Number(quantity) <= 0 || Number(unitCost) < 0) {
      toast({ title: t("common.missingFields"), description: t("common.pleaseFillAllRequiredFields"), variant: "destructive" });
      return;
    }
    createPurchaseOrderMutation.mutate();
  };

  const supplierNameById = new Map(suppliers.map((supplier: Supplier) => [supplier.id, supplier.name]));

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <PackagePlus className="h-5 w-5 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold">{t("pharmacy.procurement")}</h2>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" aria-hidden />
              {t("pharmacy.suppliers")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2" onSubmit={handleCreateSupplier}>
              <Input
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                placeholder={t("pharmacy.supplierName")}
                aria-label={t("pharmacy.supplierName")}
              />
              <Input
                value={supplierEmail}
                onChange={(event) => setSupplierEmail(event.target.value)}
                placeholder={t("pharmacy.supplierEmail")}
                aria-label={t("pharmacy.supplierEmail")}
              />
              <Button type="submit" disabled={createSupplierMutation.isPending}>
                <Plus className="h-4 w-4" aria-hidden />
                {t("common.add")}
              </Button>
            </form>

            <div className="space-y-2">
              {suppliersLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
              {!suppliersLoading && suppliers.length === 0 && <p className="text-sm text-muted-foreground">{t("pharmacy.noSuppliers")}</p>}
              {suppliers.map((supplier: Supplier) => (
                <div key={supplier.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{supplier.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{supplier.email || supplier.phone || t("common.email")}</p>
                  </div>
                  <StatusBadge variant={supplier.status === "active" ? "success" : "default"}>
                    {t(`pharmacy.${supplier.status}`)}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-4 w-4" aria-hidden />
              {t("pharmacy.purchaseOrders")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid grid-cols-1 md:grid-cols-2 gap-2" onSubmit={handleCreatePurchaseOrder}>
              <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                <SelectTrigger aria-label={t("pharmacy.supplier")}>
                  <SelectValue placeholder={t("pharmacy.supplier")} />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier: Supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedMedicationId} onValueChange={(value) => {
                setSelectedMedicationId(value);
                const medication = medications.find((item) => item.id === value);
                if (medication) setUnitCost(String(Number(medication.price) || 0));
              }}>
                <SelectTrigger aria-label={t("pharmacy.medication")}>
                  <SelectValue placeholder={t("pharmacy.medication")} />
                </SelectTrigger>
                <SelectContent>
                  {medications.map((medication) => (
                    <SelectItem key={medication.id} value={medication.id}>{medication.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder={t("pharmacy.quantity")}
                aria-label={t("pharmacy.quantity")}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
                placeholder={t("pharmacy.unitCost")}
                aria-label={t("pharmacy.unitCost")}
              />
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder={t("pharmacy.notes")}
                aria-label={t("pharmacy.notes")}
                className="md:col-span-2 min-h-20"
              />
              <Button
                type="submit"
                className="md:col-span-2"
                disabled={createPurchaseOrderMutation.isPending || suppliers.length === 0 || medications.length === 0}
              >
                <ShoppingCart className="h-4 w-4" aria-hidden />
                {t("pharmacy.createPurchaseOrder")}
              </Button>
            </form>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t("pharmacy.recentPurchaseOrders")}</p>
              {ordersLoading && <p className="text-sm text-muted-foreground">{t("common.loading")}</p>}
              {!ordersLoading && purchaseOrders.length === 0 && <p className="text-sm text-muted-foreground">{t("pharmacy.noPurchaseOrders")}</p>}
              {purchaseOrders.map((order: PurchaseOrder) => (
                <div key={order.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{supplierNameById.get(order.supplier_id) ?? t("pharmacy.supplier")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("pharmacy.ordered")}: {formatCurrency(Number(order.total_amount), locale)}
                    </p>
                  </div>
                  <StatusBadge variant={orderStatusVariant[order.status] ?? "default"}>
                    {t(`pharmacy.${order.status}`)}
                  </StatusBadge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
