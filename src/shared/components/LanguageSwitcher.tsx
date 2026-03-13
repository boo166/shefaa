import { useI18n, Locale } from "@/core/i18n/i18nStore";
import { Globe } from "lucide-react";

export const LanguageSwitcher = () => {
  const { locale, setLocale, t } = useI18n();

  const toggle = () => {
    const next: Locale = locale === "en" ? "ar" : "en";
    setLocale(next);
  };

  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
    >
      <Globe className="h-3.5 w-3.5" />
      {locale === "en" ? t("common.arabic") : t("common.english")}
    </button>
  );
};
