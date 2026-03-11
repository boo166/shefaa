import { useState, useEffect } from "react";
import { useI18n } from "@/core/i18n/i18nStore";
import { useAuth } from "@/core/auth/authStore";
import { LanguageSwitcher } from "@/shared/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { tenantService } from "@/services/settings/tenant.service";
import { queryKeys } from "@/services/queryKeys";

export const GeneralTab = () => {
  const { t, calendarType, setCalendarType } = useI18n();
  const { user } = useAuth();
  const isDemo = user?.tenantId === "demo";
  const [saving, setSaving] = useState(false);
  const [clinicName, setClinicName] = useState(user?.tenantName ?? "");
  const [clinicPhone, setClinicPhone] = useState("");
  const [clinicEmail, setClinicEmail] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");

  const { data: tenant } = useQuery({
    queryKey: queryKeys.settings.tenant(user?.tenantId),
    enabled: !isDemo && !!user?.tenantId,
    queryFn: () => tenantService.getCurrentTenant(),
  });

  useEffect(() => {
    if (!tenant) return;
    setClinicName(tenant.name);
    setClinicPhone(tenant.phone ?? "");
    setClinicEmail(tenant.email ?? "");
    setClinicAddress(tenant.address ?? "");
  }, [tenant]);

  const handleSave = async () => {
    if (isDemo) {
      toast({ title: t("common.demoMode"), description: t("common.demoModeNoSave"), variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await tenantService.updateCurrentTenant({
        name: clinicName,
        phone: clinicPhone || null,
        email: clinicEmail || null,
        address: clinicAddress || null,
      });
      toast({ title: t("common.saved") });
    } catch (err) {
      const message = err instanceof Error ? err.message : t("common.error");
      toast({ title: t("common.error"), description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-lg">{t("settings.clinicInfo")}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t("settings.clinicName")}</Label>
          <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("settings.slug")}</Label>
          <Input defaultValue={user?.tenantSlug ?? ""} disabled />
        </div>
        <div className="space-y-2">
          <Label>{t("common.phone")}</Label>
          <Input value={clinicPhone} onChange={(e) => setClinicPhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t("common.email")}</Label>
          <Input value={clinicEmail} onChange={(e) => setClinicEmail(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("settings.address")}</Label>
        <Input value={clinicAddress} onChange={(e) => setClinicAddress(e.target.value)} />
      </div>
      <div className="flex items-center gap-4">
        <Label>{t("common.language")}</Label>
        <LanguageSwitcher />
      </div>
      <div className="flex items-center gap-4">
        <Label>{t("settings.calendarSystem")}</Label>
        <Select value={calendarType} onValueChange={(v) => setCalendarType(v as any)}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="gregorian">{t("settings.calendarGregorian")}</SelectItem>
            <SelectItem value="hijri">{t("settings.calendarHijri")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleSave} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("common.save")}
      </Button>
    </div>
  );
};
