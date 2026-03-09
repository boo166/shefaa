import { useI18n } from "@/core/i18n/i18nStore";
import { Switch } from "@/components/ui/switch";
import { useDarkMode } from "@/hooks/useDarkMode";

export const AppearanceTab = () => {
  const { t } = useI18n();
  const { enabled: darkMode, setEnabled: setDarkMode } = useDarkMode();

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-lg">{t("settings.appearance")}</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div>
            <p className="text-sm font-medium">{t("common.darkMode")}</p>
            <p className="text-xs text-muted-foreground">{t("common.toggleTheme")}</p>
          </div>
          <Switch checked={darkMode} onCheckedChange={setDarkMode} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <span className="text-sm">{t("common.compactView")}</span>
          <span className="text-xs text-muted-foreground">{t("common.comingSoon")}</span>
        </div>
      </div>
    </div>
  );
};
